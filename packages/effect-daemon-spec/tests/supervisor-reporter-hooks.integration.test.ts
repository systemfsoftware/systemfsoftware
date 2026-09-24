import { BoundedIntensity } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { DaemonReporter } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Duration, Effect, Layer, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it })
Feature('Per-supervisor reporter hooks')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Supervisor reporter hook runs alongside global reporter on restart',
      Gherkin.Do.pipe(
        Given('a global reporter spy')('spy', () => ReporterSpyContext),
        Given('a supervisor-local restart hook tracker')(
          'localRestarts',
          () => Ref.make<readonly Cause.Cause<never>[]>([]),
        ),
        When('a restartable child fails once under a oneForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const failOnce = yield* Ref.make(true)
            const child = Daemon.poll({
              name: 'hook-A',
              work: Effect.gen(function*() {
                const shouldFail = yield* Ref.getAndSet(failOnce, false)
                if (shouldFail) {
                  return yield* SimulatedFailure.make()
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
                intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(
                  Schedule.upTo({ duration: Duration.millis(50) }),
                ),
                cooldown: Duration.minutes(30),
              }),
              reporter: {
                onRestart: (cause) => Ref.update(s.localRestarts, (r) => [...r, cause]).pipe(Effect.asVoid),
              },
              lock: { mode: 'none' },
            })
            const reporterLayer = Layer.mergeAll(
              LeaderLock.Noop,
              Layer.succeed(DaemonReporter, {
                onRestart: s.spy.reporter.onRestart,
                onExhausted: s.spy.reporter.onExhausted,
              }),
            )
            yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.millis(200))
            const globalRestarts = yield* s.spy.getRestarts()
            const local = yield* Ref.get(s.localRestarts)
            return { globalRestarts, local }
          })),
        Then(
          'the global reporter recorded exactly one restart for the supervisor and the local hook the same cause',
        )((s, expect) => {
          const globalCauses = s.result.globalRestarts.map((r) => r.cause)
          return expect({ globalCount: globalCauses.length, local: s.result.local }).toEqual({
            globalCount: 1,
            local: globalCauses,
          })
        }),
      ),
    )

    scenario(
      'Supervisor reporter hook runs alongside global reporter on exhaustion',
      Gherkin.Do.pipe(
        Given('a global reporter spy')('spy', () => ReporterSpyContext),
        Given('a supervisor-local exhaustion hook tracker')(
          'localExhaustions',
          () => Ref.make<readonly Cause.Cause<never>[]>([]),
        ),
        When('a child exhausts a oneForOne supervisor')('result', (s) =>
          Effect.gen(function*() {
            const child = Daemon.poll({
              name: 'hook-B',
              work: SimulatedFailure.make(),
              interval: Duration.millis(10),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'hook-exhaust-sup',
              children: [child],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(
                  Schedule.upTo({ duration: Duration.millis(50) }),
                ),
                cooldown: Duration.hours(1),
              }),
              reporter: {
                onExhausted: (cause) => Ref.update(s.localExhaustions, (e) => [...e, cause]).pipe(Effect.asVoid),
              },
              lock: { mode: 'none' },
            })
            const reporterLayer = Layer.mergeAll(
              LeaderLock.Noop,
              Layer.succeed(DaemonReporter, {
                onRestart: s.spy.reporter.onRestart,
                onExhausted: s.spy.reporter.onExhausted,
              }),
            )
            yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.millis(200))
            const globalExhaustions = yield* s.spy.getExhaustions()
            const local = yield* Ref.get(s.localExhaustions)
            return { globalExhaustions, local }
          })),
        Then(
          'the global reporter recorded exactly one exhaustion for the supervisor and the local hook the same cause',
        )((s, expect) => {
          const globalCauses = s.result.globalExhaustions.map((e) => e.cause)
          return expect({ globalCount: globalCauses.length, local: s.result.local }).toEqual({
            globalCount: 1,
            local: globalCauses,
          })
        }),
      ),
    )
  })
