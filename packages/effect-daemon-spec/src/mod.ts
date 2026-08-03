import { Duration, Effect, Layer } from 'effect'
import type { Stream } from 'effect'
export * from './backoff.kernel.js'
export * from './brands.kernel.js'
export * from './daemon-health.schema.js'
export * from './daemon-metrics.kernel.js'
export {
  BoundedIntensity,
  ChildPolicyConfig,
  Intensity,
  IntensityConfig,
  LockPolicyConfig,
  TickPolicyConfig,
  UnboundedIntensity,
} from './daemon-policy.schema.js'
export * from './daemon-reporter.adapter.js'
export * from './daemon-spec.schema.js'
import type { ChildPolicyConfig, TickPolicyConfig } from './daemon-policy.schema.js'
import { poll as pollKernel } from './daemon-poll.kernel.js'
import type {
  Child,
  CommonOpts,
  DynamicSpec,
  LockConfig,
  PollOpts,
  ReporterPolicyHooks,
  SupervisionPolicy,
  Supervisor,
  SupervisorOpts,
  TickPolicyHooks,
  Worker,
} from './daemon-spec.schema.js'
import { stream as streamKernel } from './daemon-stream.kernel.js'
import { subscription as subscriptionKernel } from './daemon-subscription.kernel.js'
export const poll = <A, E, R, L extends LockConfig>(opts: PollOpts<A, E, R, L>): Worker<E, R, L> =>
  pollKernel<
    Effect.Effect<A, E, R>,
    A,
    E,
    R,
    TickPolicyConfig,
    TickPolicyHooks,
    ChildPolicyConfig,
    L,
    PollOpts<A, E, R, L>
  >(opts)
export const stream = <A, E, R, L extends LockConfig>(
  opts: CommonOpts<L> & { readonly stream: Stream.Stream<A, E, R> },
): Worker<E, R, L> =>
  streamKernel<
    Stream.Stream<A, E, R>,
    TickPolicyConfig,
    TickPolicyHooks,
    ChildPolicyConfig,
    L,
    CommonOpts<L> & {
      readonly name: string
      readonly stream: Stream.Stream<A, E, R>
      readonly tick: TickPolicyConfig
      readonly tickHooks?: TickPolicyHooks
      readonly child?: ChildPolicyConfig
      readonly lock: L
    }
  >(opts)
export const subscription = <A, E, R, L extends LockConfig>(
  opts: CommonOpts<L> & { readonly acquire: Effect.Effect<A, E, R> },
): Worker<E, R, L> =>
  subscriptionKernel<
    E,
    R,
    Effect.Effect<A, E, R>,
    TickPolicyConfig,
    TickPolicyHooks,
    ChildPolicyConfig,
    L,
    CommonOpts<L> & {
      readonly name: string
      readonly acquire: Effect.Effect<A, E, R>
      readonly tick: TickPolicyConfig
      readonly tickHooks?: TickPolicyHooks
      readonly child?: ChildPolicyConfig
      readonly lock: L
    }
  >(opts)
export const Daemon = {
  poll,
  stream,
  subscription,
} as const
export * from './leader-lock.adapter.js'
export * from './leader-lock.schema.js'
export { LockPrimitiveError } from './lock-primitive.schema.js'
import { worker } from './daemon-worker.executor.js'
import { dynamic as dynamicRuntime } from './internal/build-dynamic.executor.js'
import { supervisor } from './internal/supervisor-body.executor.js'
export { supervisor, worker }
export { withLeaderLock } from './leader-lock.kernel.js'
export type { LeaderLockOptions } from './leader-lock.kernel.js'
export const run = {
  worker,
  supervisor,
  dynamic: dynamicRuntime,
} as const
import { LeaderConfig } from './internal/supervision-leader.state.js'
import { TaskConfig } from './internal/supervision-task.state.js'
import { WorkerConfig } from './internal/supervision-worker.state.js'
import { custom } from './supervision-custom.kernel.js'
import { leader as leaderKernel } from './supervision-leader.kernel.js'
import { task as taskKernel } from './supervision-task.kernel.js'
import { worker as supervisionKernel } from './supervision-worker.kernel.js'
export const leader = (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(LeaderConfig, (config) => leaderKernel(config, cap))
export const task = (budget: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(TaskConfig, (config) => taskKernel(config, budget))
export const supervision = (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(WorkerConfig, (config) => supervisionKernel(config, cap))
export { LeaderConfig } from './internal/supervision-leader.state.js'
export { TaskConfig } from './internal/supervision-task.state.js'
export { WorkerConfig } from './internal/supervision-worker.state.js'
export const Supervision = {
  leader,
  worker: supervision,
  task,
  custom,
} as const
import { dynamic as dynamicKernel } from './supervisor-dynamic.kernel.js'
import { oneForAll as oneForAllKernel } from './supervisor-one-for-all.kernel.js'
import { oneForOne as oneForOneKernel } from './supervisor-one-for-one.kernel.js'
import { restForOne as restForOneKernel } from './supervisor-rest-for-one.kernel.js'
export const dynamic = <E, R, Args>(
  opts: { readonly name: string; readonly child: (args: Args) => Worker<E, R>; readonly maxChildren?: number },
): DynamicSpec<E, R, Args> =>
  dynamicKernel<Args, Worker<E, R>, {
    readonly name: string
    readonly child: (args: Args) => Worker<E, R>
    readonly maxChildren?: number
  }>(opts)
export const oneForAll = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  oneForAllKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
export const oneForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  oneForOneKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
export const restForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  restForOneKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
import { DaemonReporter } from './daemon-reporter.adapter.js'
import { SupervisorBodyExecutorDeps } from './internal/supervisor-body.executor.js'
import { WithLeaderLockExecutorDeps } from './internal/with-leader-lock.executor.js'
import { LeaderLock } from './leader-lock.adapter.js'

export { SupervisorBodyExecutorDeps, WithLeaderLockExecutorDeps }

export const WithLeaderLockExecutorLive: Layer.Layer<WithLeaderLockExecutorDeps, never, LeaderLock> = Layer.effect(
  WithLeaderLockExecutorDeps,
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return { withLock: lock.withLock }
  }),
)

export const SupervisorBodyExecutorLive: Layer.Layer<SupervisorBodyExecutorDeps, never, DaemonReporter> = Layer.effect(
  SupervisorBodyExecutorDeps,
  Effect.gen(function*() {
    const reporter = yield* DaemonReporter
    return { onRestart: reporter.onRestart, onExhausted: reporter.onExhausted }
  }),
)
