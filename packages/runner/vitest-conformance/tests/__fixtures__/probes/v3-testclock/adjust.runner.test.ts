import { it } from '@systemfsoftware/vitest'
import { Clock } from 'effect'
import { Effect } from 'effect'
import { Fiber } from 'effect'
import { Ref } from 'effect'
import * as TestClock from 'effect/TestClock'

it('Should_ReleaseASleeper_When_AdjustMovesTimeOnTheV3Path', function*({ expect }) {
  const shipped = Ref.makeUnsafe(false)
  const shipper = yield* Effect.forkChild(Effect.sleep('3 seconds').pipe(Effect.andThen(Ref.set(shipped, true))))
  yield* TestClock.adjust('3 seconds')
  const arrived = yield* Ref.get(shipped)
  const now = yield* Clock.currentTimeMillis
  yield* Fiber.join(shipper)
  yield* expect({ arrived, now }).toEqual({ arrived: true, now: 3000 })
})
