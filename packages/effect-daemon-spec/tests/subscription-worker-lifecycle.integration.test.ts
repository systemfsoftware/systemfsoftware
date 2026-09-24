import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it })

Feature('Subscription Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Runs acquire when started',
      Gherkin.Do.pipe(
        Given('an acquired ref')('acquiredRef', () => Ref.make(false)),
        When('a subscription worker is started')('observed', (s) =>
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
            return { acquired, health }
          })),
        Then('the acquire ran and ready is open')((s, expect) =>
          Effect.gen(function*() {
            const ready = yield* s.observed.health.ready.await.pipe(Effect.timeout('0 millis'), Effect.result)
            yield* expect({ acquired: s.observed.acquired, ready }).toEqual({
              acquired: true,
              ready: expect.objectContaining({ _tag: 'Success', success: undefined }),
            })
          })
        ),
      ),
    )

    scenario(
      'Closing the pause gate does not stop a running subscription',
      Gherkin.Do.pipe(
        Given('an acquired ref')('acquiredRef', () => Ref.make(false)),
        When('a subscription worker is started then gate is closed')('observed', (s) =>
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
            yield* health.paused.close
            yield* TestClock.adjust(Duration.millis(5))
            return { acquired, health }
          })),
        Then('the acquire ran and ready stays open after the gate close')((s, expect) =>
          Effect.gen(function*() {
            const ready = yield* s.observed.health.ready.await.pipe(Effect.timeout('0 millis'), Effect.result)
            yield* expect({ acquired: s.observed.acquired, ready }).toEqual({
              acquired: true,
              ready: expect.objectContaining({ _tag: 'Success', success: undefined }),
            })
          })
        ),
      ),
    )
  })
