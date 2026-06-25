import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Duration, Effect, Layer, Match, Option, Ref, Schedule, Schema as S, Stream, TestClock } from 'effect'
import { expect } from 'vitest'
import { BoundedIntensity } from '../daemon-policy.schema.js'
import { DaemonReporter } from '../daemon-reporter.js'
import { Daemon } from '../daemon.js'
import { LeaderLock } from '../leader-lock.js'
import { run } from '../run.js'
import { Supervision } from '../supervision-preset.js'
import { oneForAll, oneForOne, restForOne } from '../supervisor.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

const Feature = makeFeature({ it, layer })

Feature('Supervisor cooldown recovery')
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Supervisor recovers after cooldown when child succeeds after exhaustion',
      Gherkin.Do.pipe(
        Given('a reporter spy')('spy', () => ReporterSpyContext),
        Given('tick counter and post-cooldown run tracker')(
          'state',
          () => Effect.all({ tick: Ref.make(0), runsAfterCooldown: Ref.make(0) }),
        ),
        When('a oneForOne supervisor with zero restart budget and short cooldown runs across the boundary')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const child = Daemon.poll({
                name: 'A',
                work: Effect.gen(function*() {
                  const n = yield* Ref.modify(s.state.tick, (x) => [x, x + 1])
                  if (n === 0) {
                    return yield* new SimulatedFailure()
                  }
                  yield* Ref.update(s.state.runsAfterCooldown, (c) => c + 1)
                  return void 0
                }),
                interval: Duration.millis(10),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = oneForOne({
                name: 'cooldown-recover',
                children: [child],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo(Duration.millis(30)),
                  ),
                  cooldown: Duration.seconds(2),
                }),
                lock: { mode: 'none' },
              })
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                Layer.succeed(DaemonReporter, s.spy.reporter),
              )
              const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.millis(80))
              const exhaustionsMid = yield* s.spy.getExhaustions()
              const unhealthyMid = yield* health.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(true),
                  onSuccess: () => Effect.succeed(false),
                }),
              )
              yield* TestClock.adjust(Duration.seconds(2))
              yield* TestClock.adjust(Duration.millis(300))
              const runsAfter = yield* Ref.get(s.state.runsAfterCooldown)
              const healthyFinal = yield* health.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(false),
                  onSuccess: () => Effect.succeed(true),
                }),
              )
              const exhaustionsFinal = yield* s.spy.getExhaustions()
              return { exhaustionsMid, unhealthyMid, runsAfter, healthyFinal, exhaustionsFinal }
            }),
        ),
        Then('the supervisor healthy latch is open again')((s) =>
          Effect.sync(() => {
            expect(s.result.healthyFinal).toBe(true)
          })
        ),
        And('the reporter recorded one exhaustion before recovery')((s) =>
          Effect.sync(() => {
            const ex = s.result.exhaustionsFinal.filter((e) => e.name === 'cooldown-recover')
            expect(ex).toHaveLength(1)
            expect(s.result.exhaustionsMid.length).toBeGreaterThanOrEqual(1)
          })
        ),
        And('the child ran again after the cooldown boundary')((s) =>
          Effect.sync(() => {
            expect(s.result.runsAfter).toBeGreaterThanOrEqual(1)
            expect(s.result.unhealthyMid).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'OneForAll supervisor recovers after cooldown when a child succeeds after exhaustion',
      Gherkin.Do.pipe(
        Given('a reporter spy')('spy', () => ReporterSpyContext),
        Given('tick counter and post-cooldown run tracker')(
          'state',
          () => Effect.all({ tick: Ref.make(0), runsAfterCooldown: Ref.make(0) }),
        ),
        When('a oneForAll supervisor with zero restart budget and short cooldown runs across the boundary')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const childA = Daemon.poll({
                name: 'A',
                work: Effect.gen(function*() {
                  const n = yield* Ref.modify(s.state.tick, (x) => [x, x + 1])
                  if (n === 0) {
                    return yield* new SimulatedFailure()
                  }
                  yield* Ref.update(s.state.runsAfterCooldown, (c) => c + 1)
                  return void 0
                }),
                interval: Duration.millis(10),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const childB = Daemon.poll({
                name: 'B',
                work: Effect.void,
                interval: Duration.millis(10),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = oneForAll({
                name: 'cooldown-recover-oneForAll',
                children: [childA, childB],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo(Duration.millis(30)),
                  ),
                  cooldown: Duration.seconds(2),
                }),
                lock: { mode: 'none' },
              })
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                Layer.succeed(DaemonReporter, s.spy.reporter),
              )
              const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.millis(80))
              const exhaustionsMid = yield* s.spy.getExhaustions()
              const unhealthyMid = yield* health.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(true),
                  onSuccess: () => Effect.succeed(false),
                }),
              )
              yield* TestClock.adjust(Duration.seconds(2))
              yield* TestClock.adjust(Duration.millis(300))
              const runsAfter = yield* Ref.get(s.state.runsAfterCooldown)
              const healthyFinal = yield* health.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(false),
                  onSuccess: () => Effect.succeed(true),
                }),
              )
              const exhaustionsFinal = yield* s.spy.getExhaustions()
              return { exhaustionsMid, unhealthyMid, runsAfter, healthyFinal, exhaustionsFinal }
            }),
        ),
        Then('the supervisor healthy latch is open again')((s) =>
          Effect.sync(() => {
            expect(s.result.healthyFinal).toBe(true)
          })
        ),
        And('the reporter recorded one exhaustion before recovery')((s) =>
          Effect.sync(() => {
            const ex = s.result.exhaustionsFinal.filter((e) => e.name === 'cooldown-recover-oneForAll')
            expect(ex).toHaveLength(1)
            expect(s.result.exhaustionsMid.length).toBeGreaterThanOrEqual(1)
          })
        ),
        And('a child ran again after the cooldown boundary')((s) =>
          Effect.sync(() => {
            expect(s.result.runsAfter).toBeGreaterThanOrEqual(1)
            expect(s.result.unhealthyMid).toBe(true)
          })
        ),
      ),
    )
  })

Feature('Per-supervisor reporter hooks')
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Supervisor reporter hook runs alongside global reporter on restart',
      Gherkin.Do.pipe(
        Given('a global reporter spy')('spy', () => ReporterSpyContext),
        Given('a supervisor-local restart hook tracker')(
          'localRestarts',
          () => Ref.make<ReadonlyArray<Cause.Cause<unknown>>>([]),
        ),
        When('a restartable child fails once under a oneForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const failOnce = yield* Ref.make(true)
            const child = Daemon.poll({
              name: 'hook-A',
              work: Effect.gen(function*() {
                const shouldFail = yield* Ref.getAndSet(failOnce, false)
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
              name: 'hook-restart-sup',
              children: [child],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                cooldown: Duration.minutes(30),
              }),
              reporter: {
                onRestart: (cause) => Ref.update(s.localRestarts, (r) => [...r, cause]).pipe(Effect.asVoid),
              },
              lock: { mode: 'none' },
            })
            const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
            yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.millis(200))
            const globalRestarts = yield* s.spy.getRestarts()
            const local = yield* Ref.get(s.localRestarts)
            return { globalRestarts, local }
          })),
        Then('the global reporter recorded one restart for the supervisor')((s) =>
          Effect.sync(() => {
            const g = s.result.globalRestarts.filter((r) => r.name === 'hook-restart-sup')
            expect(g).toHaveLength(1)
          })
        ),
        And('the supervisor-local restart hook recorded the same restart cause')((s) =>
          Effect.sync(() => {
            const gOpt = Option.fromNullable(
              s.result.globalRestarts.find((r) => r.name === 'hook-restart-sup'),
            )
            expect(Option.isSome(gOpt)).toBe(true)
            expect(s.result.local).toHaveLength(1)
            if (Option.isNone(gOpt)) {
              throw new Error('expected global restart entry for hook-restart-sup')
            }
            expect(s.result.local[0]).toBe(gOpt.value.cause)
          })
        ),
      ),
    )

    scenario(
      'Supervisor reporter hook runs alongside global reporter on exhaustion',
      Gherkin.Do.pipe(
        Given('a global reporter spy')('spy', () => ReporterSpyContext),
        Given('a supervisor-local exhaustion hook tracker')(
          'localExhaustions',
          () => Ref.make<ReadonlyArray<Cause.Cause<unknown>>>([]),
        ),
        When('a child exhausts a oneForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const child = Daemon.poll({
              name: 'hook-B',
              work: new SimulatedFailure(),
              interval: Duration.millis(10),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'hook-exhaust-sup',
              children: [child],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                cooldown: Duration.hours(1),
              }),
              reporter: {
                onExhausted: (cause) => Ref.update(s.localExhaustions, (e) => [...e, cause]).pipe(Effect.asVoid),
              },
              lock: { mode: 'none' },
            })
            const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
            yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.millis(200))
            const globalExhaustions = yield* s.spy.getExhaustions()
            const local = yield* Ref.get(s.localExhaustions)
            return { globalExhaustions, local }
          })),
        Then('the global reporter recorded one exhaustion for the supervisor')((s) =>
          Effect.sync(() => {
            const g = s.result.globalExhaustions.filter((e) => e.name === 'hook-exhaust-sup')
            expect(g).toHaveLength(1)
          })
        ),
        And('the supervisor-local exhaustion hook recorded the same exhaustion cause')((s) =>
          Effect.sync(() => {
            const gOpt = Option.fromNullable(
              s.result.globalExhaustions.find((e) => e.name === 'hook-exhaust-sup'),
            )
            expect(Option.isSome(gOpt)).toBe(true)
            expect(s.result.local).toHaveLength(1)
            if (Option.isNone(gOpt)) {
              throw new Error('expected global exhaustion entry for hook-exhaust-sup')
            }
            expect(s.result.local[0]).toBe(gOpt.value.cause)
          })
        ),
      ),
    )
  })

Feature('Stream child supervision')
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Failing stream child participates in restart policy',
      Gherkin.Do.pipe(
        Given('a reporter spy')('spy', () => ReporterSpyContext),
        Given('stream start counter')('streamStarts', () => Ref.make(0)),
        When('a oneForOne supervisor runs the stream child with restart budget available')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const stream = Stream.concat(
                Stream.fromEffect(
                  Ref.update(s.streamStarts, (n) => n + 1).pipe(Effect.asVoid),
                ),
                Stream.fail(new SimulatedFailure()),
              )
              const child = Daemon.stream({
                name: 'stream-restart-child',
                stream,
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = oneForOne({
                name: 'stream-restart-sup',
                children: [child],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
              const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.millis(400))
              const restarts = yield* s.spy.getRestarts()
              const starts = yield* Ref.get(s.streamStarts)
              const healthyOpen = yield* health.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(false),
                  onSuccess: () => Effect.succeed(true),
                }),
              )
              return { restarts, starts, healthyOpen }
            }),
        ),
        Then('the reporter recorded one restart for the supervisor')((s) =>
          Effect.sync(() => {
            const r = s.result.restarts.filter((x) => x.name === 'stream-restart-sup')
            expect(r.length).toBeGreaterThanOrEqual(1)
          })
        ),
        And('the stream child started more than once')((s) =>
          Effect.sync(() => {
            expect(s.result.starts).toBeGreaterThanOrEqual(2)
          })
        ),
        And('the supervisor healthy latch remains open')((s) =>
          Effect.sync(() => {
            expect(s.result.healthyOpen).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Persistently failing stream child exhausts supervisor budget',
      Gherkin.Do.pipe(
        Given('a reporter spy')('spy', () => ReporterSpyContext),
        When('a oneForOne supervisor runs the stream child with zero restart budget')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const stream = Stream.concat(
                Stream.fromEffect(Effect.void),
                Stream.fail(new SimulatedFailure()),
              )
              const child = Daemon.stream({
                name: 'stream-exhaust-child',
                stream,
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = oneForOne({
                name: 'stream-exhaust-sup',
                children: [child],
                supervision: Supervision.custom({
                  intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                  cooldown: Duration.hours(1),
                }),
                lock: { mode: 'none' },
              })
              const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
              const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.millis(300))
              const exhaustions = yield* s.spy.getExhaustions()
              const healthyOpen = yield* health.healthy.await.pipe(
                Effect.timeout('0 millis'),
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(false),
                  onSuccess: () => Effect.succeed(true),
                }),
              )
              return { exhaustions, healthyOpen }
            }),
        ),
        Then('the supervisor healthy latch is closed')((s) =>
          Effect.sync(() => {
            expect(s.result.healthyOpen).toBe(false)
          })
        ),
        And('the reporter recorded one exhaustion for the supervisor')((s) =>
          Effect.sync(() => {
            const e = s.result.exhaustions.filter((x) => x.name === 'stream-exhaust-sup')
            expect(e).toHaveLength(1)
          })
        ),
      ),
    )
  })

Feature('OneForOne Strategy')
  .withScenarioLayer(TestClock.defaultTestClock)
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
            const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
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
            const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
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

Feature('OneForAll Strategy')
  .withScenarioLayer(TestClock.defaultTestClock)
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
                  return yield* new SimulatedFailure()
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
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
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
            yield* TestClock.adjust(Duration.seconds(2))

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
                    return yield* new SimulatedFailure()
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
                  intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                    Schedule.jittered,
                    Schedule.upTo(Duration.minutes(5)),
                  ),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const outer = oneForAll({
                name: 'outer-nested',
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
              yield* TestClock.adjust(Duration.millis(1))
              yield* health.ready.await

              const aBefore = yield* Ref.get(s.counters.a)

              yield* Ref.set(s.failOnce, true)
              yield* TestClock.adjust(Duration.millis(500))

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
                  return yield* new SimulatedFailure()
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
            yield* TestClock.adjust(Duration.seconds(2))

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

Feature('RestForOne Strategy')
  .withScenarioLayer(TestClock.defaultTestClock)
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
                  return yield* new SimulatedFailure()
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
            const cBefore = yield* Ref.get(s.counters.c)

            yield* Ref.set(s.pauseA, true)
            yield* TestClock.adjust(Duration.millis(50))
            yield* Ref.set(s.failOnceB, true)
            yield* TestClock.adjust(Duration.millis(100))

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
                  return yield* new SimulatedFailure()
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
            const cBefore = yield* Ref.get(s.counters.c)

            yield* Ref.set(s.failOnceA, true)
            yield* TestClock.adjust(Duration.seconds(2))

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
                  return yield* new SimulatedFailure()
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
                if (n % 2 === 0) return yield* new SimulatedFailure()
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
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(1)).pipe(Schedule.upTo(Duration.millis(5))),
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
                  return yield* new SimulatedFailure()
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
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo(Duration.minutes(5)),
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

Feature('Uniform Supervisor Behavior')
  .withScenarioLayer(TestClock.defaultTestClock)
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
                  intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                    Schedule.jittered,
                    Schedule.upTo(Duration.minutes(5)),
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
                intensity: new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo(Duration.minutes(5)),
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
                  if (n > 1) return yield* new SimulatedFailure()
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
                  intensity: new BoundedIntensity({ restarts: 1, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo(Duration.millis(50)),
                  ),
                  cooldown: Duration.minutes(30),
                }),
              })
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                Layer.succeed(DaemonReporter, s.spy.reporter),
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
