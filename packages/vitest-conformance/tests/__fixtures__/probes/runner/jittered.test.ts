import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { Ref } from 'effect'
import { Schedule } from 'effect'

it('Should_CompleteJitteredDelays_When_FractionalMillisOccur', function*({ expect }) {
  const ticks = Ref.makeUnsafe(0)
  yield* Effect.repeat(
    Ref.update(ticks, (n) => n + 1),
    Schedule.jittered(Schedule.spaced('1 millis')).pipe(Schedule.upTo({ times: 4 })),
  )
  const total = yield* Ref.get(ticks)
  yield* expect(total).toEqual(5)
})
