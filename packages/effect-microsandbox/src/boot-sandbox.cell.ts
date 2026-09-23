import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array, Effect, Function, Option, pipe } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as Match from 'effect/Match'
import type { NetworkPolicy, Sandbox, SandboxBuilder } from 'microsandbox'
import { LoopbackViolationError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import type { PortBinding, SandboxPlan } from './render-sandbox-plan.schema.js'
import { PlanSandbox, renderSandboxPlan } from './render-sandbox-plan.workflow.js'

type NapiMountBuilderT = { bind(host: string): NapiMountBuilderT }
type NapiNetworkBuilderT = { policy(policy: NetworkPolicy): NapiNetworkBuilderT }
type NetworkPolicyFactory = {
  readonly fromProfiles: (profiles: Iterable<'public' | 'private' | 'host'>) => NetworkPolicy
}

const STOP_TIMEOUT_MS = 10_000
const KILL_TIMEOUT_MS = 5_000
const LOOPBACK_HOST = '127.0.0.1'

export interface AcquiredVM {
  readonly spec: MicroVMSpec
  readonly plan: SandboxPlan
  readonly sandbox: Sandbox
}
const compilePlan: {
  (plan: SandboxPlan, networkPolicy: NetworkPolicyFactory): (builder: SandboxBuilder) => SandboxBuilder
  (builder: SandboxBuilder, plan: SandboxPlan, networkPolicy: NetworkPolicyFactory): SandboxBuilder
} = Function.dual(
  3,
  (builder: SandboxBuilder, plan: SandboxPlan, networkPolicy: NetworkPolicyFactory): SandboxBuilder =>
    pipe(
      builder.image(plan.image).envs({ ...plan.envs }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.cpus), {
          onNone: () => b,
          onSome: (cpus) => b.cpus(cpus),
        }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.memoryMiB), {
          onNone: () => b,
          onSome: (mem) => b.memory(mem),
        }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.workdir), {
          onNone: () => b,
          onSome: (wd) => b.workdir(wd),
        }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.cmd), {
          onNone: () => b,
          onSome: (cmd) => b.cmd([...cmd]),
        }),
      (b) =>
        Array.reduce(
          plan.mounts,
          b,
          (acc, m) => acc.volume(m.guest, (v: NapiMountBuilderT) => v.bind(m.host)),
        ),
      (b) =>
        Array.reduce(
          plan.portBindings,
          b,
          (acc, p) => acc.portBind(p.host, p.hostPort, p.guest),
        ),
      (b) =>
        Option.match(Option.fromNullishOr(plan.networkProfiles), {
          onNone: () => b,
          onSome: (profiles) => b.network((n: NapiNetworkBuilderT) => n.policy(networkPolicy.fromProfiles(profiles))),
        }),
    ),
)

const createSandbox = (spec: MicroVMSpec, plan: SandboxPlan) =>
  Effect.tryPromise({
    try: () => import('microsandbox'),
    catch: (cause) => new SandboxBootError({ sandboxName: plan.name, cause }),
  }).pipe(
    Effect.flatMap(({ Sandbox, NetworkPolicy }) =>
      Effect.tryPromise({
        try: () => compilePlan(Sandbox.builder(plan.name), plan, NetworkPolicy).create(),
        catch: (cause) => new SandboxBootError({ sandboxName: plan.name, cause }),
      })
    ),
    Effect.map((sandbox): AcquiredVM => ({ spec, plan, sandbox })),
  )

const teardown = (sandbox: Sandbox) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => sandbox.stopWithTimeout(STOP_TIMEOUT_MS)).pipe(
      Effect.catchDefect(() =>
        Effect.promise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MS)).pipe(
          Effect.catchDefect(() => Effect.void),
        )
      ),
    )
    yield* Effect.promise(() => sandbox.destroy({ force: true })).pipe(
      Effect.catchDefect(() => Effect.void),
    )
  }).pipe(Effect.uninterruptible)

const allocateBinding = (guest: number) =>
  Effect.scoped(
    NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0 }).pipe(
      Effect.mapError((cause) => new PortAllocationError({ guestPort: guest, cause })),
      Effect.flatMap((server) => {
        const address = server.address
        return Option.match(Option.fromNullishOr('port' in address ? address.port : undefined), {
          onNone: () => Effect.fail(new PortAllocationError({ guestPort: guest })),
          onSome: (port) => Effect.succeed<PortBinding>({ guest, host: LOOPBACK_HOST, hostPort: port }),
        })
      }),
    ),
  )

const allocateBindings = (guests: ReadonlyArray<number>) =>
  Effect.forEach(guests, (guest) => allocateBinding(guest), { concurrency: 'unbounded' })

const readPlanCommand = (spec: MicroVMSpec) =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto
    const ports = Match.value(spec).pipe(
      Match.tag('Service', (s) => s.ports),
      Match.tag('Job', () => []),
      Match.exhaustive,
    )
    const bindings = yield* allocateBindings(ports)
    const id = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
    return new PlanSandbox({
      spec,
      bindings,
      name: `effect-microsandbox-${process.pid}-${id.slice(0, 8)}`,
    })
  })

export const bootSandbox = Sandwich.named('boot_sandbox')(readPlanCommand)
  .decide(renderSandboxPlan)
  .write({
    PlanApproved: (approved, command) =>
      Effect.acquireRelease(createSandbox(command.spec, approved.plan), (vm) => teardown(vm.sandbox)),
    PlanRefused: (refused) =>
      Effect.fail(
        new LoopbackViolationError({
          sandboxName: refused.sandboxName,
          host: refused.host,
          guestPort: refused.guestPort,
        }),
      ),
    CommandRejected: (rejected, command) =>
      Effect.fail(new SandboxBootError({ sandboxName: command.name, cause: rejected })),
  })
