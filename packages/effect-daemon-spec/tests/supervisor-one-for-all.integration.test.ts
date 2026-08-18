import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForAll } from '../src/mod.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it, layer })
Feature('OneForAll Strategy')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'One child failure restarts ALL children',
      Gherkin.Do.pipe(
        Given('two counter refs')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0) })),
        Given('a fail-once flag')('failOnce', () => Ref.make(false)),
        When('child A fails once in a oneForAll supervisor')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.a, (n) => n + 1)
                const shouldFail = yield* Ref.get(s.failOnce)
                if (shouldFail) {
                  return yield* SimulatedFailure.make()
                }
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childB = Daemon.poll({
              name: 'B',
              work: Ref.update(s.counters.b, (n) => n + 1),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForAll({
              name: 'oneForAll-restartAll',
              children: [childA, childB],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)),
                cooldown: Duration.zero,
              }),
              lock: { mode: 'none' },
            })
            const health = yield* run.supervisor(sup).pipe(Effect.provide(NoopLayer))
            yield* TestClock.adjust(Duration.millis(1))
            yield* health.ready.await

            const aBefore = yield* Ref.get(s.counters.a)
            const bBefore = yield* Ref.get(s.counters.b)

            yield* Ref.set(s.failOnce, true)
            yield* TestClock.adjust(Duration.seconds(12))

            const aAfter = yield* Ref.get(s.counters.a)
            const bAfter = yield* Ref.get(s.counters.b)
            return { aBefore, bBefore, aAfter, bAfter }
          })),
        Then('child A count increased after restart')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toBeGreaterThan(s.result.aBefore)
          })
        ),
        And('child B count increased (restarted together with A)')((s) =>
          Effect.sync(() => {
            expect(s.result.bAfter).toBeGreaterThan(s.result.bBefore)
          })
        ),
      ),
    )

    scenario(
      'Nested oneForAll restarts entire subtree',
      Gherkin.Do.pipe(
        Given('counter refs for inner children')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0) })),
        Given('a fail-once flag')('failOnce', () => Ref.make(false)),
        When('an outer oneForAll contains an inner oneForAll and inner child fails')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const innerChild = Daemon.poll({
                name: 'inner-A',
                work: Effect.gen(function*() {
                  yield* Ref.update(s.counters.a, (n) => n + 1)
                  const shouldFail = yield* Ref.get(s.failOnce)
                  if (shouldFail) {
                    return yield* SimulatedFailure.make()
                  }
                  return void 0
                }),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const inner = oneForAll({
                name: 'inner',
                children: [innerChild],
                supervision: Supervision.custom({
                  intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                    Schedule.jittered,
                    Schedule.upTo({ duration: Duration.minutes(5) }),
                  ),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const outer = oneForAll({
                name: 'outer-nested',
                children: [inner],
                supervision: Supervision.custom({
                  intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                    Schedule.jittered,
                    Schedule.upTo({ duration: Duration.minutes(5) }),
                  ),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const health = yield* run.supervisor(outer).pipe(Effect.provide(NoopLayer))
              yield* TestClock.adjust(Duration.millis(1))
              yield* health.ready.await

              const aBefore = yield* Ref.get(s.counters.a)

              yield* Ref.set(s.failOnce, true)
              yield* TestClock.adjust(Duration.seconds(13))

              const aAfter = yield* Ref.get(s.counters.a)
              return { aBefore, aAfter }
            }),
        ),
        Then('inner child count increased after subtree restart')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toBeGreaterThan(s.result.aBefore)
          })
        ),
      ),
    )

    scenario(
      'Child order does not affect restart behavior',
      Gherkin.Do.pipe(
        Given('counter refs for children A and B')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0) })),
        Given('a fail-once flag')('failOnce', () => Ref.make(false)),
        When('child B is listed first and fails')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.a, (n) => n + 1)
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childB = Daemon.poll({
              name: 'B',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.b, (n) => n + 1)
                const shouldFail = yield* Ref.get(s.failOnce)
                if (shouldFail) {
                  return yield* SimulatedFailure.make()
                }
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForAll({
              name: 'oneForAll-order',
              children: [childB, childA],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo({ duration: Duration.minutes(5) }),
                ),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const health = yield* run.supervisor(sup).pipe(Effect.provide(NoopLayer))
            yield* TestClock.adjust(Duration.millis(1))
            yield* health.ready.await

            const aBefore = yield* Ref.get(s.counters.a)
            const bBefore = yield* Ref.get(s.counters.b)

            yield* Ref.set(s.failOnce, true)
            yield* TestClock.adjust(Duration.seconds(13))

            const aAfter = yield* Ref.get(s.counters.a)
            const bAfter = yield* Ref.get(s.counters.b)
            return { aBefore, bBefore, aAfter, bAfter }
          })),
        Then('child A count increased despite not failing')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toBeGreaterThan(s.result.aBefore)
          })
        ),
        And('child B count increased after restart')((s) =>
          Effect.sync(() => {
            expect(s.result.bAfter).toBeGreaterThan(s.result.bBefore)
          })
        ),
      ),
    )
  })
