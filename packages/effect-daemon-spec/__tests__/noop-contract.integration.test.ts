import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, TestClock } from 'effect'
import { expect } from 'vitest'
import { Noop } from '../src/daemon-reporter/daemon-reporter.adapter.js'
import { LeaderLock } from '../src/leader-lock/leader-lock.adapter.js'
import { withLeaderLock, WithLeaderLockExecutorLive } from '../src/leader-lock/mod.js'

const Feature = makeFeature({ it, layer })

Feature('Noop Contract')
  .withLayer(Noop)
  .withScenarioLayer(
    Layer.mergeAll(
      LeaderLock.Noop,
      TestClock.defaultTestClock,
      WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
    ),
  )
  .body(({ scenario }) => {
    scenario(
      'Noop always succeeds',
      Gherkin.Do.pipe(
        When('the application acquires the lock on key "any-key" in required mode and runs work returning "always"')(
          'result',
          () => withLeaderLock(Effect.succeed('always'), { key: 'any-key', mode: 'required' }),
        ),
        Then('the result is "always"')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('always')
          })
        ),
        When('a second concurrent call with the same key also succeeds')('concurrent', () =>
          Effect.gen(function*() {
            const a = yield* Effect.fork(
              withLeaderLock(Effect.succeed('first'), { key: 'any-key', mode: 'required' }),
            )
            const b = yield* Effect.fork(
              withLeaderLock(Effect.succeed('second'), { key: 'any-key', mode: 'required' }),
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
