import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type * as Scope from 'effect/Scope'
import { MountBuilder, Sandbox } from 'microsandbox'
import type { SandboxBuilder } from 'microsandbox'
import { LoopbackViolationError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import {
  PlanSandbox,
  type PortBinding,
  renderSandboxPlan,
  type SandboxPlan,
  type SandboxPlanDecision,
} from './render-sandbox-plan.workflow.js'

type NapiMountBuilderT = InstanceType<typeof MountBuilder>

const STOP_TIMEOUT_MS = 10_000
const KILL_TIMEOUT_MS = 5_000
const LOOPBACK_HOST = '127.0.0.1'

export interface AcquiredVM {
  readonly spec: MicroVMSpec
  readonly plan: SandboxPlan
  readonly sandbox: Sandbox
}

const messageOf = (cause: unknown): string => (typeof cause === 'string' ? cause : 'non-error rejection')

export const describeCause = (cause: unknown): string => cause instanceof Error ? cause.message : messageOf(cause)

const optional = <A>(value: A | undefined, apply: (a: A) => void): void => {
  if (value !== undefined) apply(value)
}

const applyVolumes = (builder: SandboxBuilder, mounts: SandboxPlan['mounts']): void => {
  for (const mount of mounts) {
    builder.volume(mount.guest, (b: NapiMountBuilderT): NapiMountBuilderT => b.bind(mount.host))
  }
}

const applyPorts = (builder: SandboxBuilder, bindings: SandboxPlan['portBindings']): void => {
  for (const binding of bindings) {
    builder.portBind(binding.host, binding.hostPort, binding.guest)
  }
}

const applyPlan = (plan: SandboxPlan, builder: SandboxBuilder): void => {
  builder.image(plan.image)
  optional(plan.cpus, (cpus) => builder.cpus(cpus))
  optional(plan.memoryMiB, (memoryMiB) => builder.memory(memoryMiB))
  optional(plan.workdir, (workdir) => builder.workdir(workdir))
  optional(plan.cmd, (cmd) => builder.cmd([...cmd]))
  builder.envs({ ...plan.envs })
  applyVolumes(builder, plan.mounts)
  applyPorts(builder, plan.portBindings)
}

const createSandbox = (spec: MicroVMSpec, plan: SandboxPlan): Effect.Effect<AcquiredVM, SandboxBootError> =>
  Effect.map(
    Effect.tryPromise({
      try: () => {
        const builder = Sandbox.builder(plan.name)
        applyPlan(plan, builder)
        return builder.create()
      },
      catch: (cause) => new SandboxBootError({ sandboxName: plan.name, reason: describeCause(cause) }),
    }),
    (sandbox): AcquiredVM => ({ spec, plan, sandbox }),
  )

const teardown = (sandbox: Sandbox): Effect.Effect<void> =>
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

const allocateBinding = (guest: number): Effect.Effect<PortBinding, PortAllocationError> =>
  Effect.scoped(
    Effect.gen(function*() {
      const server = yield* NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0 }).pipe(
        Effect.mapError((cause) => new PortAllocationError({ guestPort: guest, reason: describeCause(cause) })),
      )
      const address = server.address
      if (!('port' in address)) {
        return yield* new PortAllocationError({ guestPort: guest, reason: 'server reported no TCP port' })
      }
      return { guest, host: LOOPBACK_HOST, hostPort: address.port }
    }),
  )

const allocateBindings = (
  guests: ReadonlyArray<number>,
): Effect.Effect<ReadonlyArray<PortBinding>, PortAllocationError> =>
  Effect.forEach(guests, (guest) => allocateBinding(guest), { concurrency: 'unbounded' })

const readPlanCommand = (spec: MicroVMSpec): Effect.Effect<PlanSandbox, PortAllocationError, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto
    const bindings = yield* allocateBindings(spec.ports)
    const id = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
    return new PlanSandbox({
      spec,
      bindings,
      name: `effect-microsandbox-${process.pid}-${id.slice(0, 8)}`,
    })
  })

const writeBoot = (
  outcome: Result.Result<SandboxPlanDecision, never>,
  command: PlanSandbox,
): Effect.Effect<AcquiredVM, LoopbackViolationError | SandboxBootError, Scope.Scope> =>
  Match.value(Result.getOrThrow(outcome)).pipe(
    Match.tag('PlanRefused', (refused) =>
      Effect.fail(
        new LoopbackViolationError({
          sandboxName: refused.sandboxName,
          host: refused.host,
          guestPort: refused.guestPort,
        }),
      )),
    Match.tag(
      'PlanApproved',
      (approved) => Effect.acquireRelease(createSandbox(command.spec, approved.plan), (vm) => teardown(vm.sandbox)),
    ),
    Match.exhaustive,
  )

export const bootSandbox = Sandwich.read(readPlanCommand)
  .decide(renderSandboxPlan)
  .write(writeBoot)
