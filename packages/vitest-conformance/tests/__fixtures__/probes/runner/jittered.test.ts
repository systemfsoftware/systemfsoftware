import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { Ref } from 'effect'
import { Schedule } from 'effect'

it.effect('Should_CompleteJitteredDelays_When_FractionalMillisOccur', () =>
  Effect.gen(function*() {
    const ticks = Ref.makeUnsafe(0)
    yield* Effect.repeat(
      Ref.update(ticks, (n) => n + 1),
      Schedule.jittered(Schedule.spaced('1 millis')).pipe(Schedule.upTo({ times: 4 })),
    )
    const total = yield* Ref.get(ticks)
    return yield* Effect.sync(() => expect(total).toEqual(5))
  }))
