import { Array, Context, Effect, Function, Option, pipe } from 'effect'
import type { NetworkPolicy, Sandbox, SandboxBuilder } from 'microsandbox'
import { SandboxBootError } from './MicroVMError.schema.js'
import type { SandboxPlan } from './render-sandbox-plan.schema.js'

type NapiMountBuilderT = { bind(host: string): NapiMountBuilderT }
type NapiNetworkBuilderT = { policy(policy: NetworkPolicy): NapiNetworkBuilderT }
type NetworkPolicyFactory = {
  readonly fromProfiles: (profiles: Iterable<'public' | 'private' | 'host'>) => NetworkPolicy
}

const STOP_TIMEOUT_MS = 10_000
const KILL_TIMEOUT_MS = 5_000

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

const acquire = (plan: SandboxPlan): Effect.Effect<Sandbox, SandboxBootError> =>
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
  )

const release = (sandbox: Sandbox): Effect.Effect<void> =>
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

export interface SandboxRuntimeShape {
  readonly acquire: (plan: SandboxPlan) => Effect.Effect<Sandbox, SandboxBootError>
  readonly release: (sandbox: Sandbox) => Effect.Effect<void>
}

export const SandboxRuntime: Context.Reference<SandboxRuntimeShape> = Context.Reference<SandboxRuntimeShape>(
  '@systemfsoftware/effect-microsandbox/SandboxRuntime',
  { defaultValue: () => ({ acquire, release }) },
)
