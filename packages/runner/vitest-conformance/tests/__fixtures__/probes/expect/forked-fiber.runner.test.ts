import { describe, it } from '@systemfsoftware/vitest'
import { Effect, Fiber } from 'effect'

const observed = (): number => 1

describe('a check in a forked fiber', () => {
  it('Should_FailTheTest_When_ChildFiberCheckFails', function*({ expect }) {
    const child = yield* Effect.forkChild(expect(observed()).toEqual(2))
    yield* Fiber.join(child)
  })
})
