import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Ref, Schedule, Schema as S, TestClock } from 'effect'
import { expect } from 'vitest'
import { SupervisorBodyExecutorDeps } from '../src/daemon-reporter/mod.js'
import { BoundedIntensity } from '../src/daemon-spec/mod.js'
import { LeaderLock } from '../src/leader-lock/leader-lock.adapter.js'
import { WithLeaderLockExecutorLive } from '../src/leader-lock/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/supervision-policy/supervisor-one-for-one.combinator.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

const Feature = makeFeature({ it, layer })
Feature('OneForOne Strategy')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Child failure reports restart',
      Gherkin.Do.pipe(
        Given('a reporter spy')('spy', () => ReporterSpyContext),
        Given('a fail-once flag')('failOnce', () => Ref.make(true)),
        When('a oneForOne supervisor runs with a fail-once child')('result', (s) =>
          Effect.gen(function*() {
            const child = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                const shouldFail = yield* Ref.getAndSet(s.failOnce, false)
                if (shouldFail) {
                  return yield* new SimulatedFailure()
                }
                return void 0
              }),
              interval: Duration.millis(10),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'oneForOne-restart',
              children: [child],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const reporterLayer = Layer.mergeAll(
              LeaderLock.Noop,
              WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
              Layer.succeed(SupervisorBodyExecutorDeps, {
                onRestart: s.spy.reporter.onRestart,
                onExhausted: s.spy.reporter.onExhausted,
              }),
            )
            yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.millis(200))
            const restarts = yield* s.spy.getRestarts()
            return { restarts }
          })),
        Then('at least 1 restart was reported for the supervisor')((s) =>
          Effect.sync(() => {
            const matching = s.result.restarts.filter((r) => r.name === 'oneForOne-restart')
            expect(matching.length).toBeGreaterThanOrEqual(1)
          })
        ),
      ),
    )

    scenario(
      'Persistent failure reports exhausted',
      Gherkin.Do.pipe(
        Given('a reporter spy')('spy', () => ReporterSpyContext),
        When('a oneForOne supervisor runs with always-failing child')('result', (s) =>
          Effect.gen(function*() {
            const child = Daemon.poll({
              name: 'A',
              work: new SimulatedFailure(),
              interval: Duration.millis(10),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'oneForOne-exhaust',
              children: [child],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 1, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const reporterLayer = Layer.mergeAll(
              LeaderLock.Noop,
              WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
              Layer.succeed(SupervisorBodyExecutorDeps, {
                onRestart: s.spy.reporter.onRestart,
                onExhausted: s.spy.reporter.onExhausted,
              }),
            )
            yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.millis(500))
            const exhaustions = yield* s.spy.getExhaustions()
            return { exhaustions }
          })),
        Then('exactly 1 exhausted event was reported')((s) =>
          Effect.sync(() => {
            expect(s.result.exhaustions).toHaveLength(1)
            expect(s.result.exhaustions[0]?.name).toBe('oneForOne-exhaust')
          })
        ),
      ),
    )

    scenario(
      'Child restarts independently',
      Gherkin.Do.pipe(
        Given('two counter refs')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0) })),
        Given('a fail-once flag for child A')('failOnce', () => Ref.make(false)),
        When('a oneForOne supervisor runs with children A and B')('result', (s) =>
          Effect.gen(function*() {
            const childA = Daemon.poll({
              name: 'A',
              work: Effect.gen(function*() {
                yield* Ref.update(s.counters.a, (n) => n + 1)
                const shouldFail = yield* Ref.get(s.failOnce)
                if (shouldFail) {
                  return yield* new SimulatedFailure()
                }
                return void 0
              }),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const childB = Daemon.poll({
              name: 'B',
              work: Ref.update(s.counters.b, (n) => n + 1),
              interval: Duration.millis(100),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'oneForOne-indep',
              children: [childA, childB],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo(Duration.minutes(5)),
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
            yield* TestClock.adjust(Duration.millis(300))

            const aAfter = yield* Ref.get(s.counters.a)
            const bAfter = yield* Ref.get(s.counters.b)
            return { aBefore, bBefore, aAfter, bAfter }
          })),
        Then('child A restarted (count increased)')((s) =>
          Effect.sync(() => {
            expect(s.result.aAfter).toBeGreaterThan(s.result.aBefore)
          })
        ),
        And('child B continued ticking (count increased)')((s) =>
          Effect.sync(() => {
            expect(s.result.bAfter).toBeGreaterThan(s.result.bBefore)
          })
        ),
      ),
    )

    scenario(
      'Nested supervisor ready propagates',
      Gherkin.Do.pipe(
        Given('counter refs for inner children')('counters', () => Effect.all({ a: Ref.make(0), b: Ref.make(0) })),
        When('an outer oneForOne supervisor contains an inner supervisor')('health', (s) =>
          Effect.gen(function*() {
            const inner = oneForOne({
              name: 'inner',
              children: [
                Daemon.poll({
                  name: 'inner-A',
                  work: Ref.update(s.counters.a, (n) => n + 1),
                  interval: Duration.millis(1),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              ],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo(Duration.minutes(5)),
                ),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const outer = oneForOne({
              name: 'outer',
              children: [inner],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo(Duration.minutes(5)),
                ),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const health = yield* run.supervisor(outer).pipe(Effect.provide(NoopLayer))
            yield* TestClock.adjust(Duration.millis(10))
            const open = yield* health.ready.await.pipe(
              Effect.timeout('0 millis'),
              Effect.matchEffect({
                onFailure: () => Effect.succeed(false),
                onSuccess: () => Effect.succeed(true),
              }),
            )
            const a = yield* Ref.get(s.counters.a)
            return { open, a }
          })),
        Then('outer supervisor ready is open')((s) =>
          Effect.sync(() => {
            expect(s.health.open).toBe(true)
          })
        ),
        And('inner child ticked at least once')((s) =>
          Effect.sync(() => {
            expect(s.health.a).toBeGreaterThanOrEqual(1)
          })
        ),
      ),
    )
  })
