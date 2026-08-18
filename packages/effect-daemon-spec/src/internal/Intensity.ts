import { Clock, Duration, Effect, Ref } from 'effect'
import { exceedsRestarts, pruneTimestamps, recordTimestamp } from './IntensityWindow.js'

export interface IntensityTracker {
  readonly record: Effect.Effect<void>
  readonly isExceeded: Effect.Effect<boolean>
  readonly count: Effect.Effect<number>
}

export const neverExceeds: IntensityTracker = {
  record: Effect.void,
  isExceeded: Effect.succeed(false),
  count: Effect.succeed(0),
}

export const make = (restarts: number, window: Duration.Duration): Effect.Effect<IntensityTracker> =>
  Effect.gen(function*() {
    const windowMillis = Duration.toMillis(window)
    const timestamps = yield* Ref.make<readonly number[]>([])
    const prune = (now: number): Effect.Effect<readonly number[]> =>
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

/** The window the in-source fake-clock laws drive across. */
const EDGE_WINDOW_SECONDS = 10

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, expect, it } = await import('@effect/vitest')
  const { Duration: D, Effect } = await import('effect')
  const { TestClock } = await import('effect/testing')

  describe('make', () => {
    it.effect('Should_NotExceed_When_RecordsStayBelowThreshold', () =>
      Effect.gen(function*() {
        const tracker = yield* make(5, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(3)
        expect(yield* tracker.isExceeded).toBe(false)
      }))

    it.effect('Should_Exceed_When_OneRecordPastThreshold', () =>
      Effect.gen(function*() {
        const tracker = yield* make(3, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.isExceeded).toBe(true)
      }))

    it.effect('Should_NotExceed_When_ExactlyAtThreshold', () =>
      Effect.gen(function*() {
        const tracker = yield* make(3, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(3)
        expect(yield* tracker.isExceeded).toBe(false)
      }))

    it.effect('Should_Exceed_When_RecordsPastThresholdInsideOneWindow', () =>
      Effect.gen(function*() {
        const tracker = yield* make(2, D.seconds(60))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        expect(yield* tracker.count).toBe(3)
        expect(yield* tracker.isExceeded).toBe(true)
      }))

    it.effect('Should_PruneRecord_When_ClockPassesWindow', () =>
      Effect.gen(function*() {
        const tracker = yield* make(5, D.seconds(EDGE_WINDOW_SECONDS))
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(EDGE_WINDOW_SECONDS + 1))
        expect(yield* tracker.count).toBe(0)
      }))

    it.effect('Should_RetainRecord_When_ClockLandsExactlyOnWindowEdge', () =>
      Effect.gen(function*() {
        const tracker = yield* make(5, D.seconds(EDGE_WINDOW_SECONDS))
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(EDGE_WINDOW_SECONDS))
        expect(yield* tracker.count).toBe(1)
      }))

    it.effect('Should_ExpireEveryRecord_When_WholeWindowElapses', () =>
      Effect.gen(function*() {
        const tracker = yield* make(5, D.seconds(1))
        yield* tracker.record
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(2))
        expect(yield* tracker.count).toBe(0)
      }))

    it.effect('Should_TrackCount_When_WindowSlidesPastRecords', () =>
      Effect.gen(function*() {
        const tracker = yield* make(3, D.seconds(5))
        yield* tracker.record
        yield* tracker.record
        yield* tracker.record
        yield* TestClock.adjust(D.seconds(3))
        expect(yield* tracker.count).toBe(3)
        yield* TestClock.adjust(D.seconds(3))
        expect(yield* tracker.count).toBe(0)
      }))
  })
}
