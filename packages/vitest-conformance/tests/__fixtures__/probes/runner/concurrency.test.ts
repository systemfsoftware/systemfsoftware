import { describe, it } from '@effect/vitest'
import { Effect } from 'effect'

describe('interleaved concurrent failures', () => {
  it('Should_ReportOnlyItsFailure_When_FirstTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect('first-marker').toEqual('first-expected-marker')
  })

  it('Should_ReportOnlyItsFailure_When_SecondTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect('second-marker').toEqual('second-expected-marker')
  })

  it('Should_ReportOnlyItsFailure_When_ThirdTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect('third-marker').toEqual('third-expected-marker')
  })

  it('Should_ReportOnlyItsFailure_When_FourthTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect('fourth-marker').toEqual('fourth-expected-marker')
  })
})
