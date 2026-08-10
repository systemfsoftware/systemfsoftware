import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Ref, Schedule, Schema as S, Stream, TestClock } from 'effect'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { SupervisorBodyExecutorDeps, WithLeaderLockExecutorLive } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/supervision-policy/supervisor-one-for-one.combinator.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

const Feature = makeFeature({ it, layer })
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
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                Layer.succeed(SupervisorBodyExecutorDeps, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
              )
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
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                Layer.succeed(SupervisorBodyExecutorDeps, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
              )
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
