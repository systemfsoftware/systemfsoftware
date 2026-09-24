import { BoundedIntensity } from '@systemfsoftware/effect-daemon-spec'
import { DaemonReporter, run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it })

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
            const healthy = yield* supHealth.healthy.await.pipe(Effect.timeout('0 millis'), Effect.result)
            const exhaustions = yield* spy.getExhaustions()
            return { exhaustions, healthy }
          })),
        Then('healthy latch is closed and spy records one exhaustion for the supervisor')((s, expect) => {
          const [exhaustion] = s.out.exhaustions
          return expect({
            cause: exhaustion?.cause,
            exhaustions: s.out.exhaustions.length,
            healthy: s.out.healthy,
            name: exhaustion?.name,
          }).toMatchObject({
            cause: { reasons: [{ _tag: 'Die', defect: 'boom' }] },
            exhaustions: 1,
            healthy: { _tag: 'Failure', failure: { _tag: 'TimeoutError' } },
            name: 'exhaust-sup',
          })
        }),
      ),
    )
  })
