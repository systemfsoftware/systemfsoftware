/// <reference types="vitest/import-meta" />
import { Latch, Schema as S } from 'effect'
import type { Effect } from 'effect'

export class DynamicLimitExceeded extends S.TaggedError<DynamicLimitExceeded>()(
  'DynamicLimitExceeded',
  { limit: S.Int.pipe(S.check(S.isGreaterThanOrEqualTo(0))) },
) {}

export interface DaemonHealth {
  readonly name: string
  readonly ready: Latch.Latch
  readonly healthy: Latch.Latch
  readonly paused: Latch.Latch
}

export interface SupervisorHealth {
  readonly name: string
  readonly ready: Latch.Latch
  readonly healthy: Latch.Latch
  readonly paused: Latch.Latch
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
