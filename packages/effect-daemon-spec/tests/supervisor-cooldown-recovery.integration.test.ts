import { BoundedIntensity } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { DaemonReporter } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForAll, oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Ref, Schedule, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it })
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
                    return yield* SimulatedFailure.make()
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
                  intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo({ duration: Duration.millis(30) }),
                  ),
                  cooldown: Duration.seconds(2),
                }),
                lock: { mode: 'none' },
              })
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                Layer.succeed(DaemonReporter, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
              )
              const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.millis(80))
              const exhaustionsMid = yield* s.spy.getExhaustions()
              const unhealthyMid = yield* health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
              yield* TestClock.adjust(Duration.seconds(2))
              yield* TestClock.adjust(Duration.millis(300))
              const runsAfter = yield* Ref.get(s.state.runsAfterCooldown)
              const healthyFinal = yield* health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
              const exhaustionsFinal = yield* s.spy.getExhaustions()
              return { exhaustionsMid, unhealthyMid, runsAfter, healthyFinal, exhaustionsFinal }
            }),
        ),
        Then(
          'the healthy latch closed mid-run and is open again after the cooldown, one exhaustion was recorded before recovery, and the supervisor recovered after the boundary',
        )((s, expect) =>
          expect({
            exhaustionsFinalCount: s.result.exhaustionsFinal.length,
            exhaustionsMidCount: s.result.exhaustionsMid.length,
            healthyFinal: s.result.healthyFinal,
            runsAfter: s.result.runsAfter,
            unhealthyMid: s.result.unhealthyMid,
          }).toMatchObject({
            exhaustionsFinalCount: 1,
            exhaustionsMidCount: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
            healthyFinal: { _tag: 'Success', success: undefined },
            runsAfter: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
            unhealthyMid: { _tag: 'Failure', failure: { _tag: 'TimeoutError' } },
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
                    return yield* SimulatedFailure.make()
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
                  intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo({ duration: Duration.millis(30) }),
                  ),
                  cooldown: Duration.seconds(2),
                }),
                lock: { mode: 'none' },
              })
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                Layer.succeed(DaemonReporter, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
              )
              const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
              yield* TestClock.adjust(Duration.millis(80))
              const exhaustionsMid = yield* s.spy.getExhaustions()
              const unhealthyMid = yield* health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
              yield* TestClock.adjust(Duration.seconds(2))
              yield* TestClock.adjust(Duration.millis(300))
              const runsAfter = yield* Ref.get(s.state.runsAfterCooldown)
              const healthyFinal = yield* health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
              const exhaustionsFinal = yield* s.spy.getExhaustions()
              return { exhaustionsMid, unhealthyMid, runsAfter, healthyFinal, exhaustionsFinal }
            }),
        ),
        Then(
          'the healthy latch closed mid-run and is open again after the cooldown, one exhaustion was recorded before recovery, and the supervisor recovered after the boundary',
        )((s, expect) =>
          expect({
            exhaustionsFinalCount: s.result.exhaustionsFinal.length,
            exhaustionsMidCount: s.result.exhaustionsMid.length,
            healthyFinal: s.result.healthyFinal,
            runsAfter: s.result.runsAfter,
            unhealthyMid: s.result.unhealthyMid,
          }).toMatchObject({
            exhaustionsFinalCount: 1,
            exhaustionsMidCount: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
            healthyFinal: { _tag: 'Success', success: undefined },
            runsAfter: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
            unhealthyMid: { _tag: 'Failure', failure: { _tag: 'TimeoutError' } },
          })
        ),
      ),
    )
  })
