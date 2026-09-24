import { describe, it } from '@effect/vitest'
import { Effect, Fiber } from 'effect'

describe('a check in a forked fiber', () => {
  it('Should_FailTheTest_When_AChildFiberCheckFails', function*({ expect }) {
    const child = yield* Effect.forkChild(expect(1).toEqual(2))
    yield* Fiber.join(child)
  })
})
