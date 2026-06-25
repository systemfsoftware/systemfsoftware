import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Either, Fiber, TestClock } from 'effect'
import { expect } from 'vitest'
import { LockPrimitive, LockPrimitiveError } from '../lock-primitive.js'
import {
  mkBlockingStatefulLockPrimitive,
  mkFailingLockPrimitive,
  mkStatefulLockPrimitive,
} from './helpers/lock-primitive-fakes.js'

const Feature = makeFeature({ it, layer })

Feature('Lock Primitive Contract')
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Acquire free lock',
      { layer: mkStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('no lock is held for key "task-1"')(() => Effect.void),
        When('the caller attempts to acquire key "task-1" within a scope')(
          'results',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                const first = yield* prim.tryAcquire('task-1')
                const second = yield* prim.tryAcquire('task-1')
                return { first, second }
              }),
            ),
        ),
        Then('the return value is true')((s) =>
          Effect.sync(() => {
            expect(s.results.first).toBe(true)
          })
        ),
        And('acquiring the same key again from the same scope also returns true')((s) =>
          Effect.sync(() => {
            expect(s.results.second).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Acquire held lock',
      { layer: mkStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('the lock key "task-1" is held by another caller')('holder', () =>
          Effect.gen(function*() {
            const prim = yield* LockPrimitive
            const fiber = yield* Effect.fork(
              Effect.scoped(
                Effect.gen(function*() {
                  yield* prim.tryAcquire('task-1')
                  return yield* Effect.never
                }),
              ),
            )
            yield* Effect.yieldNow()
            return fiber
          })),
        When('the caller attempts to acquire key "task-1" within a scope')(
          'acquired',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                return yield* prim.tryAcquire('task-1')
              }),
            ),
        ),
        Then('the return value is false')((s) =>
          Effect.sync(() => {
            expect(s.acquired).toBe(false)
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.holder)),
      ),
    )

    scenario(
      'Release on scope close',
      { layer: mkStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('the caller holds key "task-1" within a scope that closes normally')(() =>
          Effect.scoped(
            Effect.gen(function*() {
              const prim = yield* LockPrimitive
              yield* prim.tryAcquire('task-1')
            }),
          )
        ),
        When('another caller attempts to acquire key "task-1"')(
          'acquired',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                return yield* prim.tryAcquire('task-1')
              }),
            ),
        ),
        Then('the acquisition succeeds')((s) =>
          Effect.sync(() => {
            expect(s.acquired).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Release on scope failure',
      { layer: mkStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('the caller holds key "task-1" within a scope that fails')(() =>
          Effect.scoped(
            Effect.gen(function*() {
              const prim = yield* LockPrimitive
              yield* prim.tryAcquire('task-1')
              return yield* Effect.fail('intentional')
            }),
          ).pipe(Effect.catchAll(() => Effect.void))
        ),
        When('another caller attempts to acquire key "task-1"')(
          'acquired',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                return yield* prim.tryAcquire('task-1')
              }),
            ),
        ),
        Then('the acquisition succeeds')((s) =>
          Effect.sync(() => {
            expect(s.acquired).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Release on scope interruption',
      { layer: mkBlockingStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('a fiber holds key "task-1" via a blocking primitive')('holder', () =>
          Effect.fork(
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                yield* prim.tryAcquire('task-1')
                return yield* Effect.never
              }),
            ),
          )),
        When('the fiber is interrupted')('interrupted', (s) => Fiber.interrupt(s.holder)),
        Then('the lock for key "task-1" is released')((_s) =>
          Effect.scoped(
            Effect.gen(function*() {
              const prim = yield* LockPrimitive
              return yield* prim.tryAcquire('task-1')
            }),
          ).pipe(
            Effect.flatMap((acquired) =>
              Effect.sync(() => {
                expect(acquired).toBe(true)
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'Key independence',
      { layer: mkStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('no locks are held')(() => Effect.void),
        When('the caller acquires key "a" within a scope')(
          'a',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                return yield* prim.tryAcquire('a')
              }),
            ),
        ),
        When('the caller acquires key "b" within the same scope')(
          'b',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const prim = yield* LockPrimitive
                return yield* prim.tryAcquire('b')
              }),
            ),
        ),
        Then('both acquire return true')((s) =>
          Effect.sync(() => {
            expect(s.a).toBe(true)
            expect(s.b).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Primitive infrastructure failure',
      { layer: mkFailingLockPrimitive },
      Gherkin.Do.pipe(
        Given('the underlying lock infrastructure is unavailable')(() => Effect.void),
        When('the caller attempts to acquire any key')(
          'error',
          () =>
            Effect.either(
              Effect.scoped(
                Effect.gen(function*() {
                  const prim = yield* LockPrimitive
                  return yield* prim.tryAcquire('any-key')
                }),
              ),
            ),
        ),
        Then('the call surfaces an infrastructure failure for the requested key')((s) =>
          Effect.sync(() => {
            expect(s.error).toEqual(
              Either.left(new LockPrimitiveError({ key: 'any-key', cause: 'infrastructure unavailable' })),
            )
          })
        ),
      ),
    )

    scenario(
      'Non-blocking contention returns false',
      { layer: mkStatefulLockPrimitive },
      Gherkin.Do.pipe(
        Given('the lock key "task-1" is held by another caller')('holder', () =>
          Effect.gen(function*() {
            const prim = yield* LockPrimitive
            const fiber = yield* Effect.fork(
              Effect.scoped(
                Effect.gen(function*() {
                  yield* prim.tryAcquire('task-1')
                  return yield* Effect.never
                }),
              ),
            )
            yield* Effect.yieldNow()
            return fiber
          })),
        When('another caller attempts to acquire key "task-1" with a timeout')(
          'result',
          () =>
            Effect.either(
              Effect.scoped(
                Effect.gen(function*() {
                  const prim = yield* LockPrimitive
                  return yield* prim.tryAcquire('task-1')
                }),
              ).pipe(Effect.timeout(Duration.seconds(1))),
            ),
        ),
        Then('the acquisition returns false within the timeout')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual(Either.right(false))
          })
        ),
        And('the holder fiber is interrupted')((s) => Fiber.interrupt(s.holder)),
      ),
    )
  })
