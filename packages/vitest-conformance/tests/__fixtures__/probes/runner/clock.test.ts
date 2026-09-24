import { expect, it } from '@effect/vitest'
import { Clock } from 'effect'
import { Effect } from 'effect'
import { Fiber } from 'effect'
import { Ref } from 'effect'

it.effect('Should_ReadShippedAt3000_When_BackgroundAndTestSleep3Seconds', () =>
  Effect.gen(function*() {
    const shipped = Ref.makeUnsafe(false)
    const shipper = yield* Effect.forkChild(Effect.sleep('3 seconds').pipe(Effect.andThen(Ref.set(shipped, true))))
    yield* Effect.sleep('3 seconds')
    const arrived = yield* Ref.get(shipped)
    const now = yield* Clock.currentTimeMillis
    yield* Fiber.join(shipper)
    expect(arrived).toEqual(true)
    expect(now).toEqual(3000)
  }))

it.effect('Should_ReadNotShipped_When_BackgroundSleeps3001Millis', () =>
  Effect.gen(function*() {
    const shipped = Ref.makeUnsafe(false)
    const shipper = yield* Effect.forkChild(Effect.sleep('3001 millis').pipe(Effect.andThen(Ref.set(shipped, true))))
    yield* Effect.sleep('3 seconds')
    const arrived = yield* Ref.get(shipped)
    const now = yield* Clock.currentTimeMillis
    yield* Fiber.interrupt(shipper)
    expect(arrived).toEqual(false)
    expect(now).toEqual(3000)
  }))

it.effect('Should_ReadShipped_When_BackgroundSleeps2999Millis', () =>
  Effect.gen(function*() {
    const shipped = Ref.makeUnsafe(false)
    const shipper = yield* Effect.forkChild(Effect.sleep('2999 millis').pipe(Effect.andThen(Ref.set(shipped, true))))
    yield* Effect.sleep('3 seconds')
    const arrived = yield* Ref.get(shipped)
    yield* Fiber.join(shipper)
    expect(arrived).toEqual(true)
  }))
