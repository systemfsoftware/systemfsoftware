import { describe, expect, it } from '@effect/vitest'
import { Duration as D, Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { make } from '../intensity.kernel.js'

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
      const tracker = yield* make(5, D.seconds(10))
      yield* tracker.record
      yield* TestClock.adjust(D.seconds(11))
      expect(yield* tracker.count).toBe(0)
    }))

  it.effect('Should_RetainRecord_When_ClockLandsExactlyOnWindowEdge', () =>
    Effect.gen(function*() {
      const tracker = yield* make(5, D.seconds(10))
      yield* tracker.record
      yield* TestClock.adjust(D.seconds(10))
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
