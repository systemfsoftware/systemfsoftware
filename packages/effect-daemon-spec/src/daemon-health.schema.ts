import { Schema as S } from 'effect'
import type { Effect } from 'effect'

export class DynamicLimitExceeded extends S.TaggedError<DynamicLimitExceeded>()(
  'DynamicLimitExceeded',
  { limit: S.Int.pipe(S.greaterThanOrEqualTo(0)) },
) {}

export interface DaemonHealth {
  readonly name: string
  readonly ready: Effect.Latch
  readonly healthy: Effect.Latch
  readonly paused: Effect.Latch
}

export interface SupervisorHealth {
  readonly name: string
  readonly ready: Effect.Latch
  readonly healthy: Effect.Latch
  readonly paused: Effect.Latch
  readonly children: readonly (DaemonHealth | SupervisorHealth)[]
}

export interface DynamicHandle<Args, R = never> {
  readonly health: SupervisorHealth
  readonly startChild: (args: Args) => Effect.Effect<ChildRef, DynamicLimitExceeded, R>
  readonly stopChild: (ref: Pick<ChildRef, 'id'>) => Effect.Effect<void>
  readonly count: Effect.Effect<number>
}

export type ChildRef = {
  readonly id: number
  readonly removed: Effect.Effect<void>
}
