import { Noop } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock, withLeaderLock } from '@systemfsoftware/effect-daemon-spec'
import type { LeaderLockAcquireError, LeaderLockOptions } from '@systemfsoftware/effect-daemon-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, Result } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { LeaderLockFake } from './__fixtures__/LeaderLockFake.js'

const withLock = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options: LeaderLockOptions,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock> =>
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return yield* withLeaderLock(self, options, lock)
  })

const Feature = makeFeature({ it, layer })

Feature('withLeaderLock Combinator Contract')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLockFake,
      TestClock.layer(),
    ),
  )
  .body(({ scenario }) => {
    scenario(
      "Required mode returns the inner effect's result when the lock is acquired",
      Gherkin.Do.pipe(
        When('the application acquires the lock on key "task" in required mode and runs work returning 42')(
          'result',
          () => withLock(Effect.succeed(42), { key: 'task', mode: 'required' }),
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
          () => withLock(Effect.succeed(42), { key: 'task', mode: 'optional' }),
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
            const fiber = yield* Effect.forkChild(
              withLock(Effect.never, { key: 'task', mode: 'required' }),
            )
            yield* Effect.yieldNow
            return fiber
          })),
        When('the application attempts to acquire the lock on key "task" in required mode')(
          'error',
          () => Effect.result(withLock(Effect.succeed(42), { key: 'task', mode: 'required' })),
        ),
        Then('the call fails because the lock could not be acquired for key "task"')((s) =>
          Effect.sync(() => {
            expect(Result.isFailure(s.error)).toBe(true)
            if (Result.isFailure(s.error)) {
              expect(s.error.failure._tag).toBe('LeaderLockNotAcquired')
              expect(s.error.failure.key).toBe('task')
            }
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
            const fiber = yield* Effect.forkChild(
              withLock(Effect.never, { key: 'task', mode: 'required' }),
            )
            yield* Effect.yieldNow
            return fiber
          })),
        When('the application attempts to acquire the lock on key "task" in optional mode')(
          'result',
          () => withLock(Effect.succeed(42), { key: 'task', mode: 'optional' }),
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
          () => Effect.result(withLock(Effect.fail('boom'), { key: 'task', mode: 'required' })),
        ),
        Then('the call fails with the original "boom" value')((s) =>
          Effect.sync(() => {
            expect(Result.isFailure(s.error)).toBe(true)
            if (Result.isFailure(s.error)) expect(s.error.failure).toBe('boom')
          })
        ),
      ),
    )
  })
