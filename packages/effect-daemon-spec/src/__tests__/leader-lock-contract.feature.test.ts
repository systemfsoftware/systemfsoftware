import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Either, Fiber, Layer, Option, TestClock } from 'effect'
import { expect } from 'vitest'
import { LeaderLock } from '../leader-lock.js'
import { LeaderLockFromPrimitive } from '../lock-primitive.js'
import { mkFailingLockPrimitive, mkStatefulLockPrimitive } from './helpers/lock-primitive-fakes.js'

const Feature = makeFeature({ it, layer })

const LeaderLockFromStatefulPrimitive = Layer.provide(LeaderLockFromPrimitive, mkStatefulLockPrimitive)
const LeaderLockFromFailingPrimitive = Layer.provide(LeaderLockFromPrimitive, mkFailingLockPrimitive)

Feature('LeaderLock Contract')
  .withLayer(LeaderLockFromStatefulPrimitive)
  .withScenarioLayer(TestClock.defaultTestClock)
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
        Then('the result is Some(result)')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual(Option.some(42))
          })
        ),
        And('after completion, key "task-1" is available again')(() =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const out = yield* lock.withLock('task-1', Effect.succeed('again'))
            expect(out).toEqual(Option.some('again'))
          })
        ),
      ),
    )

    scenario(
      'Cannot acquire already-held lock',
      Gherkin.Do.pipe(
        Given('a fiber holds the lock for key "task-1"')('holder', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const fiber = yield* Effect.fork(lock.withLock('task-1', Effect.never))
            yield* Effect.yieldNow()
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
        Then('the result is None')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual(Option.none())
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.holder)),
      ),
    )

    scenario(
      "Mutual exclusion when one fiber holds during another fiber's acquire attempt (S1)",
      Gherkin.Do.pipe(
        Given('no lock is held for key "task"')(() => Effect.void),
        When('one fiber holds the lock across a sleep while another fiber attempts to acquire')(
          'results',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              const holder = yield* Effect.fork(
                lock.withLock('task', Effect.sleep(Duration.millis(10)).pipe(Effect.as('a'))),
              )
              yield* Effect.yieldNow()
              const challenger = yield* Effect.fork(lock.withLock('task', Effect.succeed('b')))
              const b = yield* Fiber.join(challenger)
              yield* TestClock.adjust(Duration.millis(20))
              const a = yield* Fiber.join(holder)
              return { a, b }
            }),
        ),
        Then('exactly one fiber observes Some; the other observes None')((s) =>
          Effect.sync(() => {
            const someCount = [s.results.a, s.results.b].filter(Option.isSome).length
            expect(someCount).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'Acquisition returns immediately without waiting when the key is held (L3)',
      Gherkin.Do.pipe(
        Given('a fiber holds the lock for key "task" indefinitely')('holder', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const fiber = yield* Effect.fork(lock.withLock('task', Effect.never))
            yield* Effect.yieldNow()
            return fiber
          })),
        When('a second caller attempts to acquire the lock on key "task" with a 1-second timeout')(
          'result',
          () =>
            Effect.gen(function*() {
              const lock = yield* LeaderLock
              return yield* Effect.either(
                lock.withLock('task', Effect.succeed('ok')).pipe(Effect.timeout(Duration.seconds(1))),
              )
            }),
        ),
        Then('the call returns None without firing the timeout')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual(Either.right(Option.none()))
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.holder)),
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
        Then('both return Some')((s) =>
          Effect.sync(() => {
            expect(s.a).toEqual(Option.some('a-result'))
            expect(s.b).toEqual(Option.some('b-result'))
          })
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
              return yield* Effect.either(lock.withLock('task-1', Effect.fail('boom')))
            }),
        ),
        Then('the call fails with the inner failure value')((s) =>
          Effect.sync(() => {
            expect(s.failed).toEqual(Either.left('boom'))
          })
        ),
        And('the lock is released for the next caller')(() =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const out = yield* lock.withLock('task-1', Effect.succeed('ok'))
            expect(out).toEqual(Option.some('ok'))
          })
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
              const fiber = yield* Effect.fork(lock.withLock('task-1', Effect.never))
              yield* Effect.yieldNow()
              return fiber
            }),
        ),
        When('the fiber is interrupted')('interrupted', (s) => Fiber.interrupt(s.holder)),
        Then('the lock is released')(() =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const out = yield* lock.withLock('task-1', Effect.succeed('ok'))
            expect(out).toEqual(Option.some('ok'))
          })
        ),
      ),
    )

    scenario(
      'Infrastructure error wrapping',
      { layer: LeaderLockFromFailingPrimitive },
      Gherkin.Do.pipe(
        Given('the underlying lock infrastructure is unavailable')(() => Effect.void),
        When('a caller attempts to acquire the lock on key "task-1"')('error', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            return yield* Effect.either(lock.withLock('task-1', Effect.succeed('noop')))
          })),
        Then('the call surfaces a lock infrastructure failure tagged with key "task-1"')((s) =>
          Effect.sync(() => {
            Either.match(s.error, {
              onLeft: (err) => {
                expect(err).toEqual(
                  expect.objectContaining({
                    _tag: 'LeaderLockInfraError',
                    key: 'task-1',
                  }),
                )
              },
              onRight: () => expect.fail('expected the failing primitive to surface a failure'),
            })
          })
        ),
      ),
    )
  })
