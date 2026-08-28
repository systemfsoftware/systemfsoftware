import type { Cause, Duration, Effect, Metric, Option, Schedule, Stream } from 'effect'
import type { DynamicSpecTypeId, SupervisorTypeId, WorkerTypeId } from './Brands.js'
import type { ChildPolicyConfig, Intensity, MaxChildren, TickPolicyConfig } from './DaemonPolicy.schema.js'
import type { PollLoopTag, StreamLoopTag, SubscriptionLoopTag } from './LoopTags.js'

/** @public */
export type LockConfig =
  | { mode: 'none' }
  | { mode: 'optional'; key: string }
  | { mode: 'required'; key: string; acquireRetryBackoff: Schedule.Schedule<Duration.Duration> }

/** @public */
export interface CommonOpts<L extends LockConfig> {
  readonly name: string
  readonly child?: ChildPolicyConfig
  readonly tick: TickPolicyConfig
  readonly tickHooks?: TickPolicyHooks
  readonly lock: L
}

/** @public */
export type PollOpts<A, E, R, L extends LockConfig> =
  & CommonOpts<L>
  & { readonly interval: Duration.Input }
  & (
    | { readonly prereq?: undefined; readonly work: Effect.Effect<A, E, R> }
    | {
      readonly prereq: Effect.Effect<Option.Option<A>, E, R>
      readonly work: (data: A) => Effect.Effect<void, E, R>
    }
  )

/** @public */
export interface TickPolicyHooks {
  readonly spanAttributes?: Effect.Effect<Record<string, string | number | boolean>>
  readonly innerRetry?: Schedule.Schedule<unknown>
  readonly trackDuration?: Metric.Histogram<Duration.Duration>
}

/** @public */
export interface ReporterPolicyHooks {
  readonly onRestart?: (cause: Cause.Cause<never>) => Effect.Effect<void>
  readonly onExhausted?: (cause: Cause.Cause<never>) => Effect.Effect<void>
}

/** @public */
export interface PollLoop<E, R> extends PollLoopTag {
  readonly gate: Effect.Effect<Option.Option<Effect.Effect<void, E, R>>, E, R>
  readonly interval: Duration.Input
}

/** @public */
export interface StreamLoop<E, R> extends StreamLoopTag {
  readonly stream: Stream.Stream<unknown, E, R>
}

/** @public */
export interface SubscriptionLoop<E, R> extends SubscriptionLoopTag {
  readonly acquire: Effect.Effect<void, E, R>
}

/** @public */
export type LoopShape<E, R> = PollLoop<E, R> | StreamLoop<E, R> | SubscriptionLoop<E, R>

/** @public */
export interface Worker<E, R, L extends LockConfig = LockConfig> {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: LoopShape<E, R>
  readonly child: ChildPolicyConfig
  readonly tick: TickPolicyConfig
  readonly tickHooks: TickPolicyHooks
  readonly lock: L
}

/** @public */
export interface Supervisor<E, R, L extends LockConfig = LockConfig> {
  readonly [SupervisorTypeId]: SupervisorTypeId
  readonly name: string
  readonly strategy: 'one_for_one' | 'one_for_all' | 'rest_for_one'
  readonly children: readonly (Worker<E, R> | Supervisor<E, R>)[]
  readonly supervision: Effect.Effect<SupervisionPolicy>
  readonly lock: L
  readonly reporter: ReporterPolicyHooks
}

/** @public */
export interface DynamicSpec<E, R, Args> {
  readonly [DynamicSpecTypeId]: DynamicSpecTypeId
  readonly name: string
  readonly child: (args: Args) => Worker<E, R>
  readonly maxChildren: MaxChildren
}

/** @public */
export type Child<E, R> = Worker<E, R> | Supervisor<E, R>

/** @public */
export interface SupervisionPolicy {
  readonly intensity: Intensity
  readonly backoff: Schedule.Schedule<Duration.Duration>
  readonly cooldown: Duration.Input
}

/** @public */
export interface SupervisionConfig {
  readonly backoffBase: Duration.Input
  readonly intensity: Intensity
  readonly cooldown: Duration.Input
}

/** @public */
export interface SupervisorOpts<E, R, L extends LockConfig> {
  readonly name: string
  readonly children: readonly Child<E, R>[]
  readonly supervision: Effect.Effect<SupervisionPolicy>
  readonly lock: L
  readonly reporter?: ReporterPolicyHooks
}
