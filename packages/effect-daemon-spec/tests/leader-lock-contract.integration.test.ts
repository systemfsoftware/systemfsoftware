import { LeaderLockFromPrimitive } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Duration, Effect, Fiber, Layer, Option, Result } from 'effect'
import { mkStatefulLockPrimitive } from './__fixtures__/LockPrimitiveFakes.js'

const Feature = makeFeature({ it })

const LeaderLockFromStatefulPrimitive = Layer.provide(LeaderLockFromPrimitive, mkStatefulLockPrimitive)

Feature('LeaderLock Contract')
  .withLayer(LeaderLockFromStatefulPrimitive)
  .body(({ scenario }) => {
    scenario(
      'Acquire free lock and run work',
      Gherkin.Do.pipe(
        Given('no lock is held for key "task-1"')(() => Effect.void),
        When('a caller acquires the lock on key "task-1" and runs successful work')(
          'result',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              return yield* lock.withLock('task-1', Effect.succeed(42))
            }),
        ),
        Then('the result is Some(42) and key "task-1" is available again afterwards')((s, expect) =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const again = yield* lock.withLock('task-1', Effect.succeed('again'))
            return { first: s.result, again }
          }).pipe(
            Effect.map((observed) => expect(observed).toEqual({ first: Option.some(42), again: Option.some('again') })),
          )
        ),
      ),
    )

    scenario(
      'Cannot acquire already-held lock',
      Gherkin.Do.pipe(
        Given('a fiber holds the lock for key "task-1"')('holder', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const holderAcquired = yield* Deferred.make<void>()
            const fiber = yield* Effect.forkChild(
              lock.withLock('task-1', Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never)),
            )
            yield* Deferred.await(holderAcquired)
            return fiber
          })),
        When('a second caller attempts to acquire the same lock on key "task-1"')(
          'result',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              return yield* lock.withLock('task-1', Effect.succeed('noop'))
            }),
        ),
        Then('the result is None and the holder fiber is interrupted')((s, expect) =>
          Effect.gen(function*() {
            yield* Fiber.interrupt(s.holder)
            yield* expect(s.result).toEqual(Option.none())
          })
        ),
      ),
    )

    scenario(
      "Mutual exclusion when one fiber holds during another fiber's acquire attempt (S1)",
      Gherkin.Do.pipe(
        Given('no lock is held for key "task"')(() => Effect.void),
        When('one fiber holds the lock until it is let go while another fiber attempts to acquire')(
          'results',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              const holderAcquired = yield* Deferred.make<void>()
              const release = yield* Deferred.make<void>()
              const holder = yield* Effect.forkChild(
                lock.withLock(
                  'task',
                  Effect.andThen(
                    Deferred.succeed(holderAcquired, undefined),
                    Effect.as(Deferred.await(release), 'a'),
                  ),
                ),
              )
              yield* Deferred.await(holderAcquired)
              const challenger = yield* Effect.forkChild(lock.withLock('task', Effect.succeed('b')))
              const b = yield* Fiber.join(challenger)
              yield* Deferred.succeed(release, undefined)
              const a = yield* Fiber.join(holder)
              return { a, b }
            }),
        ),
        Then('exactly one fiber observes Some and the other None, whichever finishes first')((s, expect) =>
          expect([s.results.a, s.results.b].filter(Option.isSome).length).toBe(1)
        ),
      ),
    )

    scenario(
      'Acquisition returns immediately without waiting when the key is held (L3)',
      Gherkin.Do.pipe(
        Given('a fiber holds the lock for key "task" indefinitely')('holder', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const holderAcquired = yield* Deferred.make<void>()
            const fiber = yield* Effect.forkChild(
              lock.withLock('task', Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never)),
            )
            yield* Deferred.await(holderAcquired)
            return fiber
          })),
        When('a second caller attempts to acquire the lock on key "task" with a 1-second timeout')(
          'result',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              return yield* Effect.result(
                lock.withLock('task', Effect.succeed('ok')).pipe(Effect.timeout(Duration.seconds(1))),
              )
            }),
        ),
        Then('the call returns None without firing the timeout, and the holder fiber is interrupted')((s, expect) =>
          Effect.gen(function*() {
            yield* Fiber.interrupt(s.holder)
            yield* expect(s.result).toEqual(Result.succeed(Option.none()))
          })
        ),
      ),
    )

    scenario(
      'Key independence',
      Gherkin.Do.pipe(
        Given('no locks are held')(() => Effect.void),
        When('a caller acquires the lock on key "a" and runs work')('a', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            return yield* lock.withLock('a', Effect.succeed('a-result'))
          })),
        When('the same caller acquires the lock on key "b" from the same fiber')('b', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            return yield* lock.withLock('b', Effect.succeed('b-result'))
          })),
        Then('both return Some')((s, expect) =>
          expect({ a: s.a, b: s.b }).toEqual({ a: Option.some('a-result'), b: Option.some('b-result') })
        ),
      ),
    )

    scenario(
      'Release on guarded effect failure',
      Gherkin.Do.pipe(
        When('a caller acquires the lock on key "task-1" but the guarded work fails')(
          'failed',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              return yield* Effect.result(lock.withLock('task-1', Effect.fail('boom')))
            }),
        ),
        Then('the call fails with the inner failure value and the lock is released for the next caller')(
          (s, expect) =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              const released = yield* lock.withLock('task-1', Effect.succeed('ok'))
              return { failed: s.failed, released }
            }).pipe(
              Effect.map((observed) =>
                expect(observed).toEqual({ failed: Result.fail('boom'), released: Option.some('ok') })
              ),
            ),
        ),
      ),
    )

    scenario(
      'Release on guarded effect interruption',
      Gherkin.Do.pipe(
        Given('a fiber holds the lock for key "task-1" indefinitely')(
          'holder',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              const holderAcquired = yield* Deferred.make<void>()
              const fiber = yield* Effect.forkChild(
                lock.withLock('task-1', Effect.andThen(Deferred.succeed(holderAcquired, undefined), Effect.never)),
              )
              yield* Deferred.await(holderAcquired)
              return fiber
            }),
        ),
        When('the fiber is interrupted')('interrupted', (s) => Fiber.interrupt(s.holder)),
        Then('the lock is released')((_s, expect) =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            return yield* lock.withLock('task-1', Effect.succeed('ok'))
          }).pipe(Effect.map((out) => expect(out).toEqual(Option.some('ok'))))
        ),
      ),
    )
  })
