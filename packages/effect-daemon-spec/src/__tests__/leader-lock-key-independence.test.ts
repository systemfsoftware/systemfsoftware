import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, Option } from 'effect'
import { expect } from 'vitest'
import { LeaderLock } from '../leader-lock.js'
import { LeaderLockFromPrimitive } from '../lock-primitive.js'
import { mkStatefulLockPrimitive } from './helpers/lock-primitive-fakes.js'

const LeaderLockFromStatefulPrimitive = Layer.provide(LeaderLockFromPrimitive, mkStatefulLockPrimitive)

it.effect(
  'Should_AcquireEveryDistinctKey_When_AcquiredConcurrently',
  () =>
    Effect.gen(function*() {
      const lock = yield* LeaderLock
      const keys = ['alpha', 'beta', 'gamma', 'delta']

      const fibers = yield* Effect.forEach(
        keys,
        (key) => Effect.fork(lock.withLock(key, Effect.succeed(key))),
        { concurrency: 'unbounded' },
      )

      const results = yield* Effect.forEach(fibers, (f) => Fiber.join(f), {
        concurrency: 'unbounded',
      })

      const expected = keys.map((k) => Option.some(k))
      expect(results).toEqual(expected)
    }).pipe(Effect.provide(LeaderLockFromStatefulPrimitive)),
)
