import { Duration, Effect } from 'effect'
import type { Scope, Stream } from 'effect'
export * from './Backoff.js'
export * from './Brands.js'
export * from './DaemonHealth.schema.js'
export * from './DaemonMetrics.js'
export {
  BoundedIntensity,
  ChildPolicyConfig,
  Intensity,
  IntensityConfig,
  LockPolicyConfig,
  MaxChildren,
  TickPolicyConfig,
  UnboundedIntensity,
} from './DaemonPolicy.schema.js'
export * from './DaemonReporterAdapter.js'
export * from './DaemonSpec.schema.js'
// The carriers are construction wiring, and `export type` does withhold their
// values from the runtime surface — but it desynchronizes the package instead of
// narrowing it. The published types entry is api-extractor's rollup, and the
// rollup re-declares each one as `export declare const`, so a consumer's value
// import type-checks and then finds nothing at runtime. Measured: with `export
// type`, all three leave `dist/index.mjs`'s export list and stay in the rollup,
// and attw, api:check, typecheck and lint all pass. Exporting the values keeps
// the two surfaces honest, which is worth more than a smaller one.
export { PollLoopTag, StreamLoopTag, SubscriptionLoopTag } from './internal/LoopTags.js'
import type { DaemonHealth, SupervisorHealth } from './DaemonHealth.schema.js'
import { MaxChildren } from './DaemonPolicy.schema.js'
import type { ChildPolicyConfig, TickPolicyConfig } from './DaemonPolicy.schema.js'
import { poll as pollKernel } from './DaemonPoll.js'
import { DaemonReporter } from './DaemonReporterAdapter.js'
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
} from './DaemonSpec.schema.js'
import { stream as streamKernel } from './DaemonStream.js'
import { subscription as subscriptionKernel } from './DaemonSubscription.js'
import { isModeNone } from './LeaderLock.js'
import { LeaderLock } from './LeaderLockAdapter.js'
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
export * from './LeaderLock.schema.js'
export * from './LeaderLockAdapter.js'
export { LockPrimitiveError } from './LockPrimitive.schema.js'
import { worker as workerImpl } from './DaemonWorkerExecutor.js'
import { dynamic as dynamicRuntime } from './internal/BuildDynamicExecutor.js'
import { supervisor as supervisorImpl } from './internal/SupervisorBodyExecutor.js'
import type { LockBinding } from './internal/WithLockByModeExecutor.js'

/**
 * Boots a worker. The leader-lock capability is acquired here, at the composition
 * root, and handed down as part of the lock binding: the executor behind this
 * entry point never sees the tag. A worker whose lock is `{ mode: 'none' }`
 * takes no lock at all.
 */
export const worker: {
  <E, R>(w: Worker<E, R, { mode: 'none' }>): Effect.Effect<
    DaemonHealth,
    never,
    R | Scope.Scope
  >
  <E, R>(w: Worker<E, R, LockConfig>): Effect.Effect<
    DaemonHealth,
    never,
    R | LeaderLock | Scope.Scope
  >
} = <E, R>(
  w: Worker<E, R, LockConfig>,
): Effect.Effect<
  DaemonHealth,
  never,
  R | LeaderLock | Scope.Scope
> =>
  Effect.gen(function*() {
    let binding: LockBinding
    if (isModeNone(w.lock)) {
      binding = { kind: 'unlocked' }
    } else {
      const lock = yield* LeaderLock
      binding = { kind: 'locked', spec: w.lock, lock }
    }
    return yield* workerImpl(w, binding)
  })

/**
 * The supervisor: acquires the `DaemonReporter` and — unless the lock mode is none —
 * the `LeaderLock` capabilities at the composition root, then hands them down to the
 * supervisor body via the lock binding. The body itself only ever sees the service
 * values.
 */
export const supervisor = <E, R>(
  s: Supervisor<E, R, LockConfig>,
): Effect.Effect<
  SupervisorHealth,
  never,
  R | DaemonReporter | LeaderLock | Scope.Scope
> =>
  Effect.gen(function*() {
    const reporter = yield* DaemonReporter
    let binding: LockBinding
    if (isModeNone(s.lock)) {
      binding = { kind: 'unlocked' }
    } else {
      const lock = yield* LeaderLock
      binding = { kind: 'locked', spec: s.lock, lock }
    }
    return yield* supervisorImpl(s, reporter, binding)
  })
export { withLeaderLock } from './internal/WithLeaderLockExecutor.js'
export type { LeaderLockOptions } from './internal/WithLeaderLockExecutor.js'
export const run = {
  worker,
  supervisor,
  dynamic: dynamicRuntime,
} as const
import { LeaderConfig } from './internal/SupervisionLeader.js'
import { TaskConfig } from './internal/SupervisionTask.js'
import { WorkerConfig } from './internal/SupervisionWorker.js'
import { custom } from './SupervisionCustom.js'
import { leader as leaderKernel } from './SupervisionLeader.js'
import { task as taskKernel } from './SupervisionTask.js'
import { worker as supervisionKernel } from './SupervisionWorker.js'
export const leader = (cap: Duration.Input): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(LeaderConfig, (config) => leaderKernel(config, cap))
export const task = (budget: Duration.Input): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(TaskConfig, (config) => taskKernel(config, budget))
export const supervision = (cap: Duration.Input): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(WorkerConfig, (config) => supervisionKernel(config, cap))
export { LeaderConfig } from './internal/SupervisionLeader.js'
export { TaskConfig } from './internal/SupervisionTask.js'
export { WorkerConfig } from './internal/SupervisionWorker.js'
export const Supervision = {
  leader,
  worker: supervision,
  task,
  custom,
} as const
import { dynamic as dynamicKernel, MAX_CHILDREN_CEILING } from './SupervisorDynamic.js'
import { oneForAll as oneForAllKernel } from './SupervisorOneForAll.js'
import { oneForOne as oneForOneKernel } from './SupervisorOneForOne.js'
import { restForOne as restForOneKernel } from './SupervisorRestForOne.js'
export const dynamic = <E, R, Args>(
  opts: {
    readonly name: string
    readonly child: (args: Args) => Worker<E, R>
    readonly maxChildren?: MaxChildren
  },
): DynamicSpec<E, R, Args> =>
  dynamicKernel<Args, Worker<E, R>, MaxChildren, {
    readonly name: string
    readonly child: (args: Args) => Worker<E, R>
    readonly maxChildren: MaxChildren
  }>({ ...opts, maxChildren: opts.maxChildren ?? MaxChildren.make(MAX_CHILDREN_CEILING) })
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
