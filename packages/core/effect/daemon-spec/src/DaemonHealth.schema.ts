/// <reference types="vitest/import-meta" />
import { Latch, Schema as S } from 'effect'
import type { Effect } from 'effect'

export class DynamicLimitExceeded extends S.TaggedError<DynamicLimitExceeded>()(
  'DynamicLimitExceeded',
  { limit: S.Int.pipe(S.check(S.isGreaterThanOrEqualTo(0))) },
) {}

const decode = S.decodeUnknownExit(DynamicLimitExceeded)

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

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { refutes } = await import('@systemfsoftware/effect-schema-refutation')
  const { Exit } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  const negative = fc.integer({ min: -100, max: -1 })
  const nonInteger = fc.integer({ min: 0, max: 98 }).map((n) => n + 0.5)

  refutes(DynamicLimitExceeded, {
    LimitNonInteger: nonInteger.map((limit) => ({ _tag: 'DynamicLimitExceeded', limit })),
  })

  it.prop(
    '∀l_NegativeLimit_⊥',
    [negative.map((limit) => ({ _tag: 'DynamicLimitExceeded' as const, limit }))],
    ([input]) => Exit.isFailure(decode(input)),
  )
}
