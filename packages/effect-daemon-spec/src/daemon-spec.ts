import type { Cause, Duration, Effect, Metric, Option, Schedule, Stream } from 'effect'
import { ChildPolicyConfig, IntensityConfig, LockPolicyConfig, TickPolicyConfig } from './daemon-policy.schema.js'
import type { SupervisionPolicy } from './supervision-preset.js'

export { ChildPolicyConfig, IntensityConfig, LockPolicyConfig, TickPolicyConfig }

export const WorkerTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/Worker',
)
export type WorkerTypeId = typeof WorkerTypeId

export const SupervisorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/Supervisor',
)
export type SupervisorTypeId = typeof SupervisorTypeId

export const DynamicSpecTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/DynamicSpec',
)
export type DynamicSpecTypeId = typeof DynamicSpecTypeId

export type LockConfig =
  | { mode: 'none' }
  | { mode: 'optional'; key: string }
  | { mode: 'required'; key: string; acquireRetryBackoff: Schedule.Schedule<Duration.Duration> }

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
  readonly child: typeof ChildPolicyConfig.Type
  readonly tick: typeof TickPolicyConfig.Type
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

export const isWorker = <E, R>(x: Child<E, R>): x is Worker<E, R> => WorkerTypeId in x
export const isSupervisor = <E, R>(x: Child<E, R>): x is Supervisor<E, R> => SupervisorTypeId in x
