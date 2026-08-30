import { Duration, Effect } from 'effect'
import type { Stream } from 'effect'
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
export { PollLoopTag, StreamLoopTag, SubscriptionLoopTag } from './LoopTags.js'
import { MaxChildren } from './DaemonPolicy.schema.js'
import type { ChildPolicyConfig, TickPolicyConfig } from './DaemonPolicy.schema.js'
import { poll as pollKernel } from './DaemonPoll.js'
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
/** @public */
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
/** @public */
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
/** @public */
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
/** @public */
export const Daemon = {
  poll,
  stream,
  subscription,
} as const
export * from './LeaderLock.schema.js'
export * from './LeaderLockAdapter.js'
export { LockPrimitiveError } from './LockPrimitive.schema.js'
import { dynamic as dynamicRuntime } from './RunDynamic.js'
import { supervisor } from './RunSupervisor.js'
import { worker } from './RunWorker.js'
export { supervisor, worker }

export { withLeaderLock } from './WithLeaderLock.js'
/** @public */
export type { LeaderLockOptions } from './WithLeaderLock.js'
/** @public */
export const run = {
  worker,
  supervisor,
  dynamic: dynamicRuntime,
} as const
import { custom } from './SupervisionCustom.js'
import { LeaderConfig } from './SupervisionLeader.js'
import { leader as leaderKernel } from './SupervisionLeader.js'
import { TaskConfig } from './SupervisionTask.js'
import { task as taskKernel } from './SupervisionTask.js'
import { WorkerConfig } from './SupervisionWorker.js'
import { worker as supervisionKernel } from './SupervisionWorker.js'
/** @public */
export const leader = (cap: Duration.Input): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(LeaderConfig, (config) => leaderKernel(config, cap))
/** @public */
export const task = (budget: Duration.Input): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(TaskConfig, (config) => taskKernel(config, budget))
/** @public */
export const supervision = (cap: Duration.Input): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(WorkerConfig, (config) => supervisionKernel(config, cap))
export { LeaderConfig } from './SupervisionLeader.js'
export { TaskConfig } from './SupervisionTask.js'
export { WorkerConfig } from './SupervisionWorker.js'
/** @public */
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
/** @public */
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
/** @public */
export const oneForAll = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  oneForAllKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
/** @public */
export const oneForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  oneForOneKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
/** @public */
export const restForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  restForOneKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
