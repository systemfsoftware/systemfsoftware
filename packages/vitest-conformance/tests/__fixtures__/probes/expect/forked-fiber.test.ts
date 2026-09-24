import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { Fiber } from 'effect'

// The child's write announces itself: if the child is not interrupted, its defect lands in the report.
const sideEffect = Effect.die('SIDE EFFECT RAN')

it.effect('Should_InterruptTheChild_When_ACheckFailsFirst', () =>
  Effect.gen(function*() {
    const child = yield* Effect.forkChild(Effect.sleep('1 second').pipe(Effect.andThen(sideEffect)))
    expect(1).toEqual(3)
    return yield* Fiber.join(child)
  }))
