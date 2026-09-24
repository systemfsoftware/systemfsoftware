import { Noop } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock, LeaderLockNotAcquired, withLeaderLock } from '@systemfsoftware/effect-daemon-spec'
import type { LeaderLockAcquireError, LeaderLockOptions } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Fiber, Layer, Result } from 'effect'
import { LeaderLockFake } from './__fixtures__/LeaderLockFake.js'

const withLock = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options: LeaderLockOptions,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock> =>
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return yield* withLeaderLock(self, options, lock)
  })

const Feature = makeFeature({ it })

Feature('withLeaderLock Combinator Contract')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLockFake,
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
        Then('the result is 42')((s, expect) => expect(s.result).toBe(42)),
      ),
    )

    scenario(
      "Optional mode returns the inner effect's result when the lock is acquired",
      Gherkin.Do.pipe(
        When('the application acquires the lock on key "task" in optional mode and runs work returning 42')(
          'result',
          () => withLock(Effect.succeed(42), { key: 'task', mode: 'optional' }),
        ),
        Then('the result is 42')((s, expect) => expect(s.result).toBe(42)),
      ),
    )

    scenario(
      'Required mode fails the call when the lock is held by another caller',
      Gherkin.Do.pipe(
        Given('another fiber holds the lock for key "task"')('holder', () =>
          Effect.gen(function*() {
            const holderAcquired = yield* Deferred.make<void>()
            const fiber = yield* Effect.forkChild(
              withLock(
                Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never),
                { key: 'task', mode: 'required' },
              ),
            )
            yield* Deferred.await(holderAcquired)
            return fiber
          })),
        When('the application attempts to acquire the lock on key "task" in required mode')(
          'error',
          () => Effect.result(withLock(Effect.succeed(42), { key: 'task', mode: 'required' })),
        ),
        Then(
          'the call fails because the lock could not be acquired for key "task", and the holder fiber is interrupted',
        )(
          (s, expect) =>
            Effect.gen(function*() {
              yield* Fiber.interrupt(s.holder)
              yield* expect(s.error).toEqual(Result.fail(LeaderLockNotAcquired.make({ key: 'task' })))
            }),
        ),
      ),
    )

    scenario(
      'Optional mode returns void when the lock is held by another fiber',
      Gherkin.Do.pipe(
        Given('another fiber holds the lock for key "task"')('holder', () =>
          Effect.gen(function*() {
            const holderAcquired = yield* Deferred.make<void>()
            const fiber = yield* Effect.forkChild(
              withLock(
                Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never),
                { key: 'task', mode: 'required' },
              ),
            )
            yield* Deferred.await(holderAcquired)
            return fiber
          })),
        When('the application attempts to acquire the lock on key "task" in optional mode')(
          'result',
          () => withLock(Effect.succeed(42), { key: 'task', mode: 'optional' }),
        ),
        Then('the result is undefined (void), and the holder fiber is interrupted')((s, expect) =>
          Effect.gen(function*() {
            yield* Fiber.interrupt(s.holder)
            yield* expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Inner effect failures propagate unchanged through the combinator',
      Gherkin.Do.pipe(
        When('the application acquires the lock and the guarded work fails with "boom"')(
          'error',
          () => Effect.result(withLock(Effect.fail('boom'), { key: 'task', mode: 'required' })),
        ),
        Then('the call fails with the original "boom" value')((s, expect) =>
          expect(s.error).toEqual(Result.fail('boom'))
        ),
      ),
    )
  })
