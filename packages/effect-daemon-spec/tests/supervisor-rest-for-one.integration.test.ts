import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne, restForOne } from '../src/mod.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it, layer })
Feature('RestForOne Strategy')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Middle child failure restarts only tail children',
      Gherkin.Do.pipe(
        Given('three counter refs')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0), c: Ref.make(0) })),
        Given('a pause flag for A')('pauseA', () => Ref.make(false)),
        Given('a fail-once flag for B')('failOnceB', () => Ref.make(false)),
        When('child B fails in a restForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                const shouldPause = yield* Ref.get(s.pauseA)
                if (!shouldPause) {
                  yield* Ref.update(s.counters.a, (n) => n + 1)
                }
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
                const shouldFail = yield* Ref.get(s.failOnceB)
                if (shouldFail) {
                  return yield* SimulatedFailure.make()
                }
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childC = Daemon.poll({
              name: 'C',
              work: Ref.update(s.counters.c, (n) => n + 1),
              interval: Duration.millis(10),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = restForOne({
              name: 'restForOne-middle',
              children: [childA, childB, childC],
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
            const cBefore = yield* Ref.get(s.counters.c)

            yield* Ref.set(s.pauseA, true)
            yield* TestClock.adjust(Duration.millis(50))
            yield* Ref.set(s.failOnceB, true)
            yield* TestClock.adjust(Duration.seconds(13))

            const aAfter = yield* Ref.get(s.counters.a)
            const bAfter = yield* Ref.get(s.counters.b)
            const cAfter = yield* Ref.get(s.counters.c)
            return { aBefore, bBefore, cBefore, aAfter, bAfter, cAfter }
          })),
        Then('child A count is unchanged')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toEqual(s.result.aBefore)
          })
        ),
        And('child B count increased (restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.bAfter).toBeGreaterThan(s.result.bBefore)
          })
        ),
        And('child C count increased (tail restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.cAfter).toBeGreaterThan(s.result.cBefore)
          })
        ),
      ),
    )

    scenario(
      'First child failure restarts all children',
      Gherkin.Do.pipe(
        Given('three counter refs')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0), c: Ref.make(0) })),
        Given('a fail-once flag for A')('failOnceA', () => Ref.make(false)),
        When('child A fails in a restForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.a, (n) => n + 1)
                const shouldFail = yield* Ref.get(s.failOnceA)
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
            const childC = Daemon.poll({
              name: 'C',
              work: Ref.update(s.counters.c, (n) => n + 1),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = restForOne({
              name: 'restForOne-head',
              children: [childA, childB, childC],
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
            const cBefore = yield* Ref.get(s.counters.c)

            yield* Ref.set(s.failOnceA, true)
            yield* TestClock.adjust(Duration.seconds(13))

            const aAfter = yield* Ref.get(s.counters.a)
            const bAfter = yield* Ref.get(s.counters.b)
            const cAfter = yield* Ref.get(s.counters.c)
            return { aBefore, bBefore, cBefore, aAfter, bAfter, cAfter }
          })),
        Then('child A count increased (restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toBeGreaterThan(s.result.aBefore)
          })
        ),
        And('child B count increased (entire tail restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.bAfter).toBeGreaterThan(s.result.bBefore)
          })
        ),
        And('child C count increased (entire tail restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.cAfter).toBeGreaterThan(s.result.cBefore)
          })
        ),
      ),
    )

    scenario(
      'Last child failure restarts only last child',
      Gherkin.Do.pipe(
        Given('three counter refs')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0), c: Ref.make(0) })),
        Given('a pause flag for A')('pauseA', () => Ref.make(false)),
        Given('a pause flag for B')('pauseB', () => Ref.make(false)),
        Given('a fail-once flag for C')('failOnceC', () => Ref.make(false)),
        When('child C fails in a restForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                const shouldPause = yield* Ref.get(s.pauseA)
                if (!shouldPause) {
                  yield* Ref.update(s.counters.a, (n) => n + 1)
                }
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childB = Daemon.poll({
              name: 'B',
              work: Effect.gen(function*() {
                const shouldPause = yield* Ref.get(s.pauseB)
                if (!shouldPause) {
                  yield* Ref.update(s.counters.b, (n) => n + 1)
                }
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childC = Daemon.poll({
              name: 'C',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.c, (n) => n + 1)
                const shouldFail = yield* Ref.get(s.failOnceC)
                if (shouldFail) {
                  return yield* SimulatedFailure.make()
                }
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = restForOne({
              name: 'restForOne-last',
              children: [childA, childB, childC],
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

            yield* Ref.set(s.pauseA, true)
            yield* Ref.set(s.pauseB, true)
            yield* TestClock.adjust(Duration.millis(50))

            const aBefore = yield* Ref.get(s.counters.a)
            const bBefore = yield* Ref.get(s.counters.b)

            yield* Ref.set(s.failOnceC, true)
            yield* TestClock.adjust(Duration.millis(100))

            const aAfter = yield* Ref.get(s.counters.a)
            const bAfter = yield* Ref.get(s.counters.b)
            const cAfter = yield* Ref.get(s.counters.c)
            return { aBefore, bBefore, aAfter, bAfter, cAfter }
          })),
        Then('child A count is unchanged (head unaffected)')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toEqual(s.result.aBefore)
          })
        ),
        And('child B count is unchanged (head unaffected)')((s) =>
          Effect.sync(() => {
            expect(s.result.bAfter).toEqual(s.result.bBefore)
          })
        ),
        And('child C count increased (restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.cAfter).toBeGreaterThan(0)
          })
        ),
      ),
    )

    scenario(
      'Repeated middle failures only restart tail',
      Gherkin.Do.pipe(
        Given('start counters for children')(
          'startCounts',
          () => Effect.all({ a: Ref.make(0), b: Ref.make(0), c: Ref.make(0) }),
        ),
        Given('a tick counter for B')('tickB', () => Ref.make(0)),
        When('child B fails repeatedly in a restForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                const n = yield* Ref.updateAndGet(s.startCounts.a, (x) => x + 1)
                if (n > 1) yield* Effect.void
              }),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childB = Daemon.poll({
              name: 'B',
              work: Effect.gen(function*() {
                const n = yield* Ref.updateAndGet(s.tickB, (x) => x + 1)
                if (n === 1) yield* Ref.update(s.startCounts.b, (x) => x + 1)
                if (n % 2 === 0) return yield* SimulatedFailure.make()
                return void 0
              }),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childC = Daemon.poll({
              name: 'C',
              work: Effect.gen(function*() {
                yield* Ref.update(s.startCounts.c, (x) => x + 1)
                yield* Effect.void
              }),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = restForOne({
              name: 'restForOne-repeated',
              children: [childA, childB, childC],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(1)).pipe(Schedule.upTo({ duration: Duration.millis(5) })),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            yield* run.supervisor(sup).pipe(Effect.provide(NoopLayer))
            yield* TestClock.adjust(Duration.millis(500))

            const a = yield* Ref.get(s.startCounts.a)
            const c = yield* Ref.get(s.startCounts.c)
            return { a, c }
          })),
        Then('child A started exactly once')((s) =>
          Effect.sync(() => {
            expect(s.result.a).toBe(1)
          })
        ),
        And('child C restarted at least twice')((s) =>
          Effect.sync(() => {
            expect(s.result.c).toBeGreaterThanOrEqual(2)
          })
        ),
      ),
    )

    scenario(
      'RestForOne with nested supervisor in middle',
      Gherkin.Do.pipe(
        Given('counter refs for nested children')(
          'counters',
          () => Effect.all({ a: Ref.make(0), inner: Ref.make(0), c: Ref.make(0) }),
        ),
        Given('a fail-once flag for inner child')('failOnce', () => Ref.make(false)),
        When('middle child is a nested supervisor whose child fails')('result', (s) =>
          Effect.gen(function*() {
            const innerChild = Daemon.poll({
              name: 'inner-B',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.inner, (n) => n + 1)
                const shouldFail = yield* Ref.get(s.failOnce)
                if (shouldFail) {
                  return yield* SimulatedFailure.make()
                }
                return void 0
              }),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const innerSup = oneForOne({
              name: 'inner-sup',
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
            const childA = Daemon.poll({
              name: 'A',
              work: Ref.update(s.counters.a, (n) => n + 1),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childC = Daemon.poll({
              name: 'C',
              work: Ref.update(s.counters.c, (n) => n + 1),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = restForOne({
              name: 'restForOne-nested',
              children: [childA, innerSup, childC],
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

            const cBefore = yield* Ref.get(s.counters.c)

            yield* Ref.set(s.failOnce, true)
            yield* TestClock.adjust(Duration.millis(300))

            const cAfter = yield* Ref.get(s.counters.c)
            return { cBefore, cAfter }
          })),
        Then('child C count increased (tail including nested subtree restarted)')((s) =>
          Effect.sync(() => {
            expect(s.result.cAfter).toBeGreaterThan(s.result.cBefore)
          })
        ),
      ),
    )
  })
