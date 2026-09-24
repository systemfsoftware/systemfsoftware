import { BoundedIntensity } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { DaemonReporter } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Ref, Schedule, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it })
Feature('Stream child supervision')
  .withScenarioLayer(NoopLayer)
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
                Stream.fail(SimulatedFailure.make()),
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
                  intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo({ duration: Duration.millis(50) }),
                  ),
                  cooldown: Duration.minutes(30),
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
              yield* TestClock.adjust(Duration.millis(400))
              const restarts = yield* s.spy.getRestarts()
              const starts = yield* Ref.get(s.streamStarts)
              const healthy = yield* health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
              return { restarts, starts, healthy }
            }),
        ),
        Then(
          'the reporter recorded at least one restart for the supervisor, the stream child started more than once, and the healthy latch stays open',
        )((s, expect) =>
          expect({
            healthy: s.result.healthy,
            restartCount: s.result.restarts.length,
            starts: s.result.starts,
          }).toMatchObject({
            healthy: { _tag: 'Success', success: undefined },
            restartCount: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
            starts: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(2)))),
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
                Stream.fail(SimulatedFailure.make()),
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
                  intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(5)).pipe(
                    Schedule.upTo({ duration: Duration.millis(50) }),
                  ),
                  cooldown: Duration.hours(1),
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
              yield* TestClock.adjust(Duration.millis(300))
              const exhaustions = yield* s.spy.getExhaustions()
              const healthy = yield* health.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
              return { exhaustions, healthy }
            }),
        ),
        Then('the healthy latch is closed and the reporter recorded one exhaustion for the supervisor')((s, expect) =>
          expect({
            healthy: s.result.healthy,
            exhaustedBy: s.result.exhaustions.map((x) => x.name),
          }).toEqual({
            healthy: expect.objectContaining({
              _tag: 'Failure',
              failure: expect.objectContaining({ _tag: 'TimeoutError' }),
            }),
            exhaustedBy: ['stream-exhaust-sup'],
          })
        ),
      ),
    )
  })
