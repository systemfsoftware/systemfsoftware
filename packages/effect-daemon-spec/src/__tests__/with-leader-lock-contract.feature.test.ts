import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Either, Fiber, Layer, TestClock } from 'effect'
import { expect } from 'vitest'
import { DaemonReporter } from '../daemon-reporter.js'
import { LeaderLockNotAcquired, withLeaderLock } from '../leader-lock.js'
import { LeaderLockFake } from './helpers/leader-lock-fake.js'

const Feature = makeFeature({ it, layer })

Feature('withLeaderLock Combinator Contract')
  .withLayer(DaemonReporter.Noop)
  .withScenarioLayer(Layer.mergeAll(LeaderLockFake, TestClock.defaultTestClock))
  .body(({ scenario }) => {
    scenario(
      "Required mode returns the inner effect's result when the lock is acquired",
      Gherkin.Do.pipe(
        When('the application acquires the lock on key "task" in required mode and runs work returning 42')(
          'result',
          () => withLeaderLock(Effect.succeed(42), { key: 'task', mode: 'required' }),
        ),
        Then('the result is 42')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(42)
          })
        ),
      ),
    )

    scenario(
      "Optional mode returns the inner effect's result when the lock is acquired",
      Gherkin.Do.pipe(
        When('the application acquires the lock on key "task" in optional mode and runs work returning 42')(
          'result',
          () => withLeaderLock(Effect.succeed(42), { key: 'task', mode: 'optional' }),
        ),
        Then('the result is 42')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(42)
          })
        ),
      ),
    )

    scenario(
      'Required mode fails the call when the lock is held by another caller',
      Gherkin.Do.pipe(
        Given('another fiber holds the lock for key "task"')('holder', () =>
          Effect.gen(function*() {
            const fiber = yield* Effect.fork(
              withLeaderLock(Effect.never, { key: 'task', mode: 'required' }),
            )
            yield* Effect.yieldNow()
            return fiber
          })),
        When('the application attempts to acquire the lock on key "task" in required mode')(
          'error',
          () => Effect.either(withLeaderLock(Effect.succeed(42), { key: 'task', mode: 'required' })),
        ),
        Then('the call fails because the lock could not be acquired for key "task"')((s) =>
          Effect.sync(() => {
            expect(s.error).toEqual(Either.left(new LeaderLockNotAcquired({ key: 'task' })))
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.holder)),
      ),
    )

    scenario(
      'Optional mode returns void when the lock is held by another fiber',
      Gherkin.Do.pipe(
        Given('another fiber holds the lock for key "task"')('holder', () =>
          Effect.gen(function*() {
            const fiber = yield* Effect.fork(
              withLeaderLock(Effect.never, { key: 'task', mode: 'required' }),
            )
            yield* Effect.yieldNow()
            return fiber
          })),
        When('the application attempts to acquire the lock on key "task" in optional mode')(
          'result',
          () => withLeaderLock(Effect.succeed(42), { key: 'task', mode: 'optional' }),
        ),
        Then('the result is undefined (void)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.holder)),
      ),
    )

    scenario(
      'Inner effect failures propagate unchanged through the combinator',
      Gherkin.Do.pipe(
        When('the application acquires the lock and the guarded work fails with "boom"')(
          'error',
          () => Effect.either(withLeaderLock(Effect.fail('boom'), { key: 'task', mode: 'required' })),
        ),
        Then('the call fails with the original "boom" value')((s) =>
          Effect.sync(() => {
            expect(s.error).toEqual(Either.left('boom'))
          })
        ),
      ),
    )
  })
