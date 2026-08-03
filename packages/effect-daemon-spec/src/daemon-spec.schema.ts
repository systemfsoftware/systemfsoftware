import type { Cause, Duration, Effect, Metric, Option, Schedule, Stream } from 'effect'
import type { DynamicSpecTypeId, SupervisorTypeId, WorkerTypeId } from './brands.kernel.js'
import type { ChildPolicyConfig, Intensity, TickPolicyConfig } from './daemon-policy.schema.js'

export type LockConfig =
  | { mode: 'none' }
  | { mode: 'optional'; key: string }
  | { mode: 'required'; key: string; acquireRetryBackoff: Schedule.Schedule<Duration.Duration> }

export interface CommonOpts<L extends LockConfig> {
  readonly name: string
  readonly child?: ChildPolicyConfig
  readonly tick: TickPolicyConfig
  readonly tickHooks?: TickPolicyHooks
  readonly lock: L
}

export type PollOpts<A, E, R, L extends LockConfig> =
  & CommonOpts<L>
  & { readonly interval: Duration.DurationInput }
  & (
    | { readonly prereq?: undefined; readonly work: Effect.Effect<A, E, R> }
    | {
      readonly prereq: Effect.Effect<Option.Option<A>, E, R>
      readonly work: (data: A) => Effect.Effect<void, E, R>
    }
  )

export interface TickPolicyHooks {
  readonly spanAttributes?: Effect.Effect<Record<string, string | number | boolean>>
  readonly innerRetry?: Schedule.Schedule<unknown>
  readonly trackDuration?: Metric.Metric.Histogram<Duration.Duration>
}

export interface ReporterPolicyHooks {
  readonly onRestart?: (cause: Cause.Cause<never>) => Effect.Effect<void>
  readonly onExhausted?: (cause: Cause.Cause<never>) => Effect.Effect<void>
}

export type PollLoop<E, R> = {
  readonly _tag: 'Poll'
  readonly gate: Effect.Effect<Option.Option<Effect.Effect<void, E, R>>, E, R>
  readonly interval: Duration.DurationInput
}

export type StreamLoop<E, R> = {
  readonly _tag: 'Stream'
  readonly stream: Stream.Stream<unknown, E, R>
}

export type SubscriptionLoop<E, R> = {
  readonly _tag: 'Subscription'
  readonly acquire: Effect.Effect<void, E, R>
}

export type LoopShape<E, R> = PollLoop<E, R> | StreamLoop<E, R> | SubscriptionLoop<E, R>

export interface Worker<E, R, L extends LockConfig = LockConfig> {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: LoopShape<E, R>
  readonly child: ChildPolicyConfig
  readonly tick: TickPolicyConfig
  readonly tickHooks: TickPolicyHooks
  readonly lock: L
}

export interface Supervisor<E, R, L extends LockConfig = LockConfig> {
  readonly [SupervisorTypeId]: SupervisorTypeId
  readonly name: string
  readonly strategy: 'one_for_one' | 'one_for_all' | 'rest_for_one'
  readonly children: ReadonlyArray<Worker<E, R> | Supervisor<E, R>>
  readonly supervision: Effect.Effect<SupervisionPolicy>
  readonly lock: L
  readonly reporter: ReporterPolicyHooks
}

export interface DynamicSpec<E, R, Args> {
  readonly [DynamicSpecTypeId]: DynamicSpecTypeId
  readonly name: string
  readonly child: (args: Args) => Worker<E, R>
  readonly maxChildren: number
}

export type Child<E, R> = Worker<E, R> | Supervisor<E, R>

export interface SupervisionPolicy {
  readonly intensity: Intensity
  readonly backoff: Schedule.Schedule<Duration.Duration>
  readonly cooldown: Duration.DurationInput
}

export interface SupervisionConfig {
  readonly backoffBase: Duration.DurationInput
  readonly intensity: Intensity
  readonly cooldown: Duration.DurationInput
}

export interface SupervisorOpts<E, R, L extends LockConfig> {
  readonly name: string
  readonly children: ReadonlyArray<Child<E, R>>
  readonly supervision: Effect.Effect<SupervisionPolicy>
  readonly lock: L
  readonly reporter?: ReporterPolicyHooks
}
