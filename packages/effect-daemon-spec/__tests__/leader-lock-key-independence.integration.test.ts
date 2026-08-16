import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, Option } from 'effect'
import { expect } from 'vitest'
import { LeaderLockFromPrimitive } from '../src/leader-lock.adapter.js'
import { LeaderLock } from '../src/mod.js'
import { mkStatefulLockPrimitive } from './helpers/lock-primitive-fakes.js'

const Feature = makeFeature({ it, layer })

const LeaderLockFromStatefulPrimitive = Layer.provide(LeaderLockFromPrimitive, mkStatefulLockPrimitive)

Feature('Leader lock key independence')
  .withScenarioLayer(LeaderLockFromStatefulPrimitive)
  .body(({ scenario }) => {
    scenario(
      'Concurrent acquisition of distinct keys all succeed',
      Gherkin.Do.pipe(
        Given('a stateful leader lock')('_', () => Effect.void),
        When('four distinct keys are acquired concurrently')('results', () =>
          Effect.gen(function*() {
            const lock = yield* LeaderLock
            const keys = ['alpha', 'beta', 'gamma', 'delta']
            // v4 `forkChild` starts the child on the scheduler by default. Inside a
            // concurrent `forEach`, a deferred child is torn down with the item fiber
            // before the joins below can observe it, failing with "All fibers
            // interrupted". The v3 `fork` this test was ported from started the child
            // eagerly, so restore that with `startImmediately`.
            const fibers = yield* Effect.forEach(
              keys,
              (key) => Effect.forkChild(lock.withLock(key, Effect.succeed(key)), { startImmediately: true }),
              { concurrency: 'unbounded' },
            )
            return yield* Effect.forEach(fibers, (f) => Fiber.join(f), {
              concurrency: 'unbounded',
            })
          })),
        Then('every key resolves to its own value')((s) =>
          Effect.sync(() => {
            const expected = ['alpha', 'beta', 'gamma', 'delta'].map((k) => Option.some(k))
            expect(s.results).toEqual(expected)
          })
        ),
      ),
    )
  })
