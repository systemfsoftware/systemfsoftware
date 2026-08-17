import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Duration, Effect, Layer, Option, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { DaemonReporter, run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/mod.js'
import { ReporterSpyContext } from './__fixtures__/reporter-spy.js'
import { NoopLayer } from './__fixtures__/shared-layers.js'

const Feature = makeFeature({ it, layer })

Feature('Supervisor exhaustion via DaemonReporter')
  .withLayer(LeaderLock.Noop)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'persistent child failure exhausts supervisor, closes healthy, and reports onExhausted once',
      Gherkin.Do.pipe(
        Given('noop')('_', () => Effect.void),
        When('a zero-restart supervisor wraps a failing poll worker')('out', () =>
          Effect.gen(function*() {
            const spy = yield* ReporterSpyContext
            const reporterLayer = Layer.mergeAll(
              LeaderLock.Noop,
              Layer.succeed(DaemonReporter, {
                onRestart: spy.reporter.onRestart,
                onExhausted: spy.reporter.onExhausted,
              }),
            )
            const worker = Daemon.poll({
              name: 'persist-fail',
              work: Effect.fail('boom'),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'exhaust-sup',
              children: [worker],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(1), 1),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const supHealth = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.seconds(2))
            const healthyOpen = yield* supHealth.healthy.await.pipe(
              Effect.timeout('0 millis'),
              Effect.matchEffect({
                onFailure: () => Effect.succeed(false),
                onSuccess: () => Effect.succeed(true),
              }),
            )
            const exhaustions = yield* spy.getExhaustions()
            return { healthyOpen, exhaustions }
          })),
        Then('healthy latch is closed and spy records one exhaustion for the supervisor')((s) =>
          Effect.sync(() => {
            expect(s.out.healthyOpen).toBe(false)
            expect(s.out.exhaustions).toHaveLength(1)
            const exhaustion = Option.getOrThrowWith(
              Option.fromNullishOr(s.out.exhaustions[0]),
              () => new Error('expected one supervisor exhaustion event'),
            )
            expect(exhaustion.name).toBe('exhaust-sup')
            expect(Cause.hasDies(exhaustion.cause)).toBe(true)
          })
        ),
      ),
    )
  })
