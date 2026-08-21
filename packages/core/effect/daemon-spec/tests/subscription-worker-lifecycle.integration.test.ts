import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { Daemon } from '../src/mod.js'
import { run } from '../src/mod.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it, layer })

Feature('Subscription Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Runs acquire when started',
      Gherkin.Do.pipe(
        Given('an acquired ref')('acquiredRef', () => Ref.make(false)),
        When('a subscription worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.subscription({
              name: 'subscriber',
              acquire: Ref.set(s.acquiredRef, true),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            const acquired = yield* Ref.get(s.acquiredRef)
            expect(acquired).toBe(true)
            return health
          })),
        Then('ready is open')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'Closing the pause gate does not stop a running subscription',
      Gherkin.Do.pipe(
        Given('an acquired ref')('acquiredRef', () => Ref.make(false)),
        When('a subscription worker is started then gate is closed')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.subscription({
              name: 'paused-subscriber',
              acquire: Ref.set(s.acquiredRef, true),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            const acquired = yield* Ref.get(s.acquiredRef)
            expect(acquired).toBe(true)
            yield* health.paused.close
            yield* Effect.yieldNow
            yield* TestClock.adjust(Duration.millis(5))
            return health
          })),
        Then('ready stays open after gate close')((s) => s.health.ready.await),
      ),
    )
  })
