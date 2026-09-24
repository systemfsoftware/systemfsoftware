import { describe, expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const interleavedFailure = (actual: string, expected: string) =>
  Effect.gen(function*() {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* Effect.sync(() => expect(actual).toEqual(expected))
  })

describe('interleaved concurrent failures', () => {
  it.effect('Should_ReportOnlyItsFailure_When_FirstTestFails', () =>
    interleavedFailure('first-marker', 'first-expected-marker'))

  it.effect('Should_ReportOnlyItsFailure_When_SecondTestFails', () =>
    interleavedFailure('second-marker', 'second-expected-marker'))

  it.effect('Should_ReportOnlyItsFailure_When_ThirdTestFails', () =>
    interleavedFailure('third-marker', 'third-expected-marker'))

  it.effect('Should_ReportOnlyItsFailure_When_FourthTestFails', () =>
    interleavedFailure('fourth-marker', 'fourth-expected-marker'))
})
