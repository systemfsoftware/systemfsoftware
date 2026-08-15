import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, TestClock } from 'effect'
import { expect } from 'vitest'
import { Noop } from '../src/daemon-reporter.adapter.js'
import { LeaderLock, withLeaderLock } from '../src/mod.js'
import type { LeaderLockAcquireError, LeaderLockOptions } from '../src/mod.js'

const withLock = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options: LeaderLockOptions,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock> =>
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return yield* withLeaderLock(self, options, lock)
  })

const Feature = makeFeature({ it, layer })

Feature('Noop Contract')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLock.Noop,
      TestClock.defaultTestClock,
    ),
  )
  .body(({ scenario }) => {
    scenario(
      'Noop always succeeds',
      Gherkin.Do.pipe(
        When('the application acquires the lock on key "any-key" in required mode and runs work returning "always"')(
          'result',
          () => withLock(Effect.succeed('always'), { key: 'any-key', mode: 'required' }),
        ),
        Then('the result is "always"')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('always')
          })
        ),
        When('a second concurrent call with the same key also succeeds')('concurrent', () =>
          Effect.gen(function*() {
            const a = yield* Effect.fork(
              withLock(Effect.succeed('first'), { key: 'any-key', mode: 'required' }),
            )
            const b = yield* Effect.fork(
              withLock(Effect.succeed('second'), { key: 'any-key', mode: 'required' }),
            )
            const ra = yield* Fiber.join(a)
            const rb = yield* Fiber.join(b)
            return { a: ra, b: rb }
          })),
        And('both effects ran')((s) =>
          Effect.sync(() => {
            expect(s.concurrent.a).toBe('first')
            expect(s.concurrent.b).toBe('second')
          })
        ),
      ),
    )
  })
