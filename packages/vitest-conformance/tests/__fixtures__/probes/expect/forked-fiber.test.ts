import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { Fiber } from 'effect'

const sideEffect = Effect.die('SIDE EFFECT RAN')

const observed = (): number => 1

it.effect('Should_InterruptTheChild_When_CheckFailsFirst', () =>
  Effect.gen(function*() {
    const child = yield* Effect.forkChild(Effect.sleep('1 second').pipe(Effect.andThen(sideEffect)))
    expect(observed()).toEqual(3)
    return yield* Fiber.join(child)
  }))
