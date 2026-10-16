import { it } from '@systemfsoftware/vitest'
import { Clock } from 'effect'
import { Effect } from 'effect'

it('Should_StayAtZero_When_SleepEndsImmediately', function*({ expect }) {
  yield* Effect.sleep(0)
  const now = yield* Clock.currentTimeMillis
  yield* expect(now).toEqual(0)
})
