import { it } from '@systemfsoftware/vitest'
import { Cause, Effect } from 'effect'

const dieThenFail = Cause.combine(Cause.die(new Error('died-first-marker')), Cause.fail('failed-second-marker'))

it('Should_FailWithADefectThenAnError_When_ItsCauseHoldsBothInThatOrder', function*({ expect }) {
  yield* expect(dieThenFail.reasons.map(Cause.isDieReason)).toEqual([true, false])
  yield* Effect.failCause(dieThenFail)
})
