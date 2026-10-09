import { describe, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const observedMarker = (which: string): string => `${which}-marker`

describe('interleaved concurrent failures', () => {
  it('Should_ReportOnlyItsFailure_When_FirstTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect(observedMarker('first')).toEqual('first-expected-marker')
  })

  it('Should_ReportOnlyItsFailure_When_SecondTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect(observedMarker('second')).toEqual('second-expected-marker')
  })

  it('Should_ReportOnlyItsFailure_When_ThirdTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect(observedMarker('third')).toEqual('third-expected-marker')
  })

  it('Should_ReportOnlyItsFailure_When_FourthTestFails', function*({ expect }) {
    yield* Effect.yieldNow
    yield* Effect.yieldNow
    yield* expect(observedMarker('fourth')).toEqual('fourth-expected-marker')
  })
})
