import { DaemonReporter, LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it })

Feature('Leader daemon never surrenders under sustained failure')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'A persistently failing process is restarted indefinitely regardless of elapsed time',
      Gherkin.Do.pipe(
        Given('a reporter spy is configured')('spy', () => ReporterSpyContext),
        When('a persistently failing supervised process runs')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const child = Daemon.poll({
                name: 'always-fails',
                work: SimulatedFailure.make(),
                interval: Duration.millis(10),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const sup = oneForOne({
                name: 'never-surrender-sup',
                children: [child],
                supervision: Supervision.leader(Duration.seconds(30)),
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

              yield* TestClock.adjust(Duration.minutes(10))
              const early = (yield* s.spy.getRestarts()).length
              yield* TestClock.adjust(Duration.minutes(30))
              const late = (yield* s.spy.getRestarts()).length
              return { early, late }
            }),
        ),
        Then(
          'the leader restarted the process within the first 10 minutes and kept restarting it past 40 minutes',
        )((s, expect) =>
          expect(s.result).toSatisfy(
            ({ early, late }) => early > 0 && late > early,
            'the leader restarts the failing process both inside the first 10 minutes and beyond 40 minutes',
          )
        ),
      ),
    )
  })
