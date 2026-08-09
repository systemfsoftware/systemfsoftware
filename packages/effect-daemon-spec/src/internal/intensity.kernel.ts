import { Clock, Duration, Effect, Match, Ref, Schema as S } from 'effect'
import { exceedsRestarts, pruneTimestamps, recordTimestamp } from './intensity-window.kernel.js'

/**
 * Structural shape of a restart-intensity setting. Declared here rather than imported
 * from `daemon-policy.schema.ts` so this kernel stays domain-blind: the schema is a
 * shape declaration (structural, no domain behavior), the domain's `Intensity` union
 * satisfies it by shape, and `src/mod.ts` re-exports the domain-typed surface for
 * consumers.
 */
export const IntensitySpec = S.Union(
  S.TaggedStruct('Unbounded', {}),
  S.TaggedStruct('Bounded', { restarts: S.Number, window: S.DurationFromSelf }),
)
export type IntensitySpec = S.Schema.Type<typeof IntensitySpec>

export interface IntensityTracker {
  readonly record: Effect.Effect<void>
  readonly isExceeded: Effect.Effect<boolean>
  readonly count: Effect.Effect<number>
}

const neverExceeds: IntensityTracker = {
  record: Effect.void,
  isExceeded: Effect.succeed(false),
  count: Effect.succeed(0),
}

const boundedTracker = (restarts: number, window: Duration.Duration): Effect.Effect<IntensityTracker> =>
  Effect.gen(function*() {
    const windowMillis = Duration.toMillis(window)
    const timestamps = yield* Ref.make<ReadonlyArray<number>>([])
    const prune = (now: number): Effect.Effect<ReadonlyArray<number>> =>
      Ref.modify(timestamps, (ts) => {
        const active = pruneTimestamps(ts, now, windowMillis)
        return [active, active]
      })
    return {
      record: Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        yield* Ref.update(timestamps, (ts) => recordTimestamp(ts, now, windowMillis))
      }),
      isExceeded: Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        const active = yield* prune(now)
        return exceedsRestarts(active.length, restarts)
      }),
      count: Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        const active = yield* prune(now)
        return active.length
      }),
    }
  })

export const make = (intensity: IntensitySpec): Effect.Effect<IntensityTracker> =>
  Match.value(intensity).pipe(
    Match.tag('Unbounded', () => Effect.succeed(neverExceeds)),
    Match.tag('Bounded', ({ restarts, window }) => boundedTracker(restarts, window)),
    Match.exhaustive,
  )

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { describe, expect, it } = await import('@effect/vitest')
  const { Duration: D, TestClock } = await import('effect')

  describe('boundedTracker', () => {
    it.effect('Should_NotExceed_When_RecordsStayBelowThreshold', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(5, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(3)
        expect(yield* tracker.isExceeded).toBe(false)
      }))

    it.effect('Should_Exceed_When_OneRecordPastThreshold', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(3, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.isExceeded).toBe(true)
      }))

    it.effect('Should_NotExceed_When_ExactlyAtThreshold', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(3, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(3)
        expect(yield* tracker.isExceeded).toBe(false)
      }))

    it.effect('Should_Exceed_When_RecordsPastThresholdInsideOneWindow', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(2, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(3)
        expect(yield* tracker.isExceeded).toBe(true)
      }))

    it.effect('Should_PruneRecord_When_ClockPassesWindow', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(5, D.seconds(10))
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(11))
        expect(yield* tracker.count).toBe(0)
      }))

    it.effect('Should_RetainRecord_When_ClockLandsExactlyOnWindowEdge', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(5, D.seconds(10))
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(10))
        expect(yield* tracker.count).toBe(1)
      }))

    it.effect('Should_ExpireEveryRecord_When_WholeWindowElapses', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(5, D.seconds(1))
        yield* tracker.record
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(2))
        expect(yield* tracker.count).toBe(0)
      }))

    it.effect('Should_TrackCount_When_WindowSlidesPastRecords', () =>
      Effect.gen(function*() {
        const tracker = yield* boundedTracker(3, D.seconds(5))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(3))
        expect(yield* tracker.count).toBe(3)
        yield* TestClock.adjust(D.seconds(3))
        expect(yield* tracker.count).toBe(0)
      }))
  })

  describe('neverExceeds', () => {
    it.effect('Should_NeverExceed_When_IntensityIsUnbounded', () =>
      Effect.gen(function*() {
        const tracker = yield* make({ _tag: 'Unbounded' })
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(0)
        expect(yield* tracker.isExceeded).toBe(false)
      }))
  })
}
