import { it } from '@systemfsoftware/vitest'
import { Clock } from 'effect'
import { Effect } from 'effect'
import { Fiber } from 'effect'
import { Ref } from 'effect'

it('Should_ReadShippedAt3000_When_BackgroundAndTestSleep3Seconds', function*({ expect }) {
  const shipped = Ref.makeUnsafe(false)
  const shipper = yield* Effect.forkChild(Effect.sleep('3 seconds').pipe(Effect.andThen(Ref.set(shipped, true))))
  yield* Effect.sleep('3 seconds')
  const arrived = yield* Ref.get(shipped)
  const now = yield* Clock.currentTimeMillis
  yield* Fiber.join(shipper)
  yield* expect({ arrived, now }).toEqual({ arrived: true, now: 3000 })
})

it('Should_ReadNotShipped_When_BackgroundSleeps3001Millis', function*({ expect }) {
  const shipped = Ref.makeUnsafe(false)
  const shipper = yield* Effect.forkChild(Effect.sleep('3001 millis').pipe(Effect.andThen(Ref.set(shipped, true))))
  yield* Effect.sleep('3 seconds')
  const arrived = yield* Ref.get(shipped)
  const now = yield* Clock.currentTimeMillis
  yield* Fiber.interrupt(shipper)
  yield* expect({ arrived, now }).toEqual({ arrived: false, now: 3000 })
})

it('Should_ReadShipped_When_BackgroundSleeps2999Millis', function*({ expect }) {
  const shipped = Ref.makeUnsafe(false)
  const shipper = yield* Effect.forkChild(Effect.sleep('2999 millis').pipe(Effect.andThen(Ref.set(shipped, true))))
  yield* Effect.sleep('3 seconds')
  const arrived = yield* Ref.get(shipped)
  yield* Fiber.join(shipper)
  yield* expect({ arrived }).toEqual({ arrived: true })
})
