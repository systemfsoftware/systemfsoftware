import { expect, it } from '@effect/vitest'
import { Clock } from 'effect'
import { Effect } from 'effect'
import { Fiber } from 'effect'
import { Ref } from 'effect'
import { TestClock } from 'effect/testing'

it.effect('Should_ReleaseASleeper_When_AdjustMovesTime', () =>
  Effect.gen(function*() {
    const shipped = Ref.makeUnsafe(false)
    const shipper = yield* Effect.forkChild(Effect.sleep('3 seconds').pipe(Effect.andThen(Ref.set(shipped, true))))
    yield* TestClock.adjust('3 seconds')
    const arrived = yield* Ref.get(shipped)
    const now = yield* Clock.currentTimeMillis
    yield* Fiber.join(shipper)
    return yield* Effect.sync(() => {
      expect(arrived).toEqual(true)
      expect(now).toEqual(3000)
    })
  }))
