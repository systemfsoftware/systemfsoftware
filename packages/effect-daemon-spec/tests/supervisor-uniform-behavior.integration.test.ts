import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Match, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { DaemonReporter } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForAll, oneForOne, restForOne } from '../src/mod.js'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it, layer })
Feature('Uniform Supervisor Behavior')
  .withScenarioLayer(NoopLayer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      '<strategy> ready opens when all children ready',
      [
        { strategy: 'oneForOne', makeSupervisor: oneForOne },
        { strategy: 'oneForAll', makeSupervisor: oneForAll },
        { strategy: 'restForOne', makeSupervisor: restForOne },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a noop counter ref')('counter', () => Ref.make(0)),
          When('a <strategy> supervisor runs with 1 child')('health', (s) =>
            Effect.gen(function*() {
              const child = Daemon.poll({
                name: 'noop',
                work: Ref.update(s.counter, (n) => n + 1),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = row.makeSupervisor({
                name: `${row.strategy}-ready-outline`,
                children: [child],
                lock: { mode: 'none' },
                supervision: Supervision.custom({
                  intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                    Schedule.jittered,
                    Schedule.upTo({ duration: Duration.minutes(5) }),
                  ),
                  cooldown: Duration.minutes(30),
                }),
              })
              const health = yield* run.supervisor(sup).pipe(Effect.provide(NoopLayer))
              yield* TestClock.adjust(Duration.millis(10))
              return { health }
            })),
          Then('supervisor ready is open')((s) => s.health.health.ready.await),
        ),
    )

    scenarioOutline(
      '<strategy> all poll children ready opens supervisor ready',
      [{ strategy: 'oneForOne' }, { strategy: 'oneForAll' }, { strategy: 'restForOne' }],
      (row) =>
        Gherkin.Do.pipe(
          Given('counter refs for poll children')('counters', () =>
            Effect.all({ a: Ref.make(0), b: Ref.make(0), c: Ref.make(0) })),
          When('supervisor runs with ticking poll children')('health', (s) =>
            Effect.gen(function*() {
              const poll = (name: 'A' | 'B' | 'C', r: Ref.Ref<number>) =>
                Daemon.poll({
                  name,
                  work: Ref.update(r, (n) =>
                    n + 1),
                  interval: Duration.millis(1),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                })
              const supervision = Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo({ duration: Duration.minutes(5) }),
                ),
                cooldown: Duration.minutes(30),
              })
              const sup = Match.value(row.strategy).pipe(
                Match.when('oneForOne', () =>
                  oneForOne({
                    name: `${row.strategy}-multi-ready`,
                    children: [poll('A', s.counters.a), poll('B', s.counters.b)],
                    supervision,
                    lock: { mode: 'none' },
                  })),
                Match.when('oneForAll', () =>
                  oneForAll({
                    name: `${row.strategy}-multi-ready`,
                    children: [poll('A', s.counters.a), poll('B', s.counters.b)],
                    supervision,
                    lock: { mode: 'none' },
                  })),
                Match.when('restForOne', () =>
                  restForOne({
                    name: `${row.strategy}-multi-ready`,
                    children: [poll('A', s.counters.a), poll('B', s.counters.b), poll('C', s.counters.c)],
                    supervision,
                    lock: { mode: 'none' },
                  })),
                Match.exhaustive,
              )
              const health = yield* run.supervisor(sup).pipe(Effect.provide(NoopLayer))
              yield* TestClock.adjust(Duration.millis(10))
              return { health, counters: s.counters }
            })),
          Then('supervisor ready is open')((s) => s.health.health.ready.await),
          And('all started poll children ticked at least once')((s) =>
            Effect.gen(function*() {
              const a = yield* Ref.get(s.health.counters.a)
              const b = yield* Ref.get(s.health.counters.b)
              expect(a).toBeGreaterThanOrEqual(1)
              expect(b).toBeGreaterThanOrEqual(1)
              yield* Match.value(row.strategy).pipe(
                Match.when('restForOne', () =>
                  Effect.gen(function*() {
                    const c = yield* Ref.get(s.health.counters.c)
                    expect(c).toBeGreaterThanOrEqual(1)
                  })),
                Match.when('oneForOne', () => Effect.void),
                Match.when('oneForAll', () => Effect.void),
                Match.exhaustive,
              )
            })
          ),
        ),
    )

    scenarioOutline(
      '<strategy> reports exhausted on persistent failure',
      [
        { strategy: 'oneForOne', makeSupervisor: oneForOne },
        { strategy: 'oneForAll', makeSupervisor: oneForAll },
        { strategy: 'restForOne', makeSupervisor: restForOne },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a reporter spy')('spy', () => ReporterSpyContext),
          When('a <strategy> supervisor runs with an always-failing child')('result', (s) =>
            Effect.gen(function*() {
              const tickCount = yield* Ref.make(0)
              const child = Daemon.poll({
                name: 'A',
                work: Effect.gen(function*() {
                  const n = yield* Ref.updateAndGet(tickCount, (x) => x + 1)
                  if (n > 1) return yield* SimulatedFailure.make()
                  return void 0
                }),
                interval: Duration.millis(1),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = row.makeSupervisor({
                name: `${row.strategy}-exhaust-outline`,
                children: [child],
                lock: { mode: 'none' },
                supervision: Supervision.custom({
                  intensity: BoundedIntensity.make({ restarts: 1, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo({ duration: Duration.millis(50) }),
                  ),
                  cooldown: Duration.minutes(30),
                }),
              })
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                Layer.succeed(DaemonReporter, {
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
              expect(s.result.exhaustions[0]?.name).toBe(`${row.strategy}-exhaust-outline`)
            })
          ),
        ),
    )
  })
