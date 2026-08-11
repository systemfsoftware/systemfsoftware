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
import { oneForAll, oneForOne } from '../src/supervision-policy/supervisor.combinator.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

const Feature = makeFeature({ it, layer })
Feature('Supervisor cooldown recovery')
  .withScenarioLayer(NoopLayer)
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
                WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                Layer.succeed(SupervisorBodyExecutorDeps, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
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
                WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                Layer.succeed(SupervisorBodyExecutorDeps, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
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
