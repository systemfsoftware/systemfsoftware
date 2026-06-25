import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schema as S, TestClock } from 'effect'
import { expect } from 'vitest'
import { DaemonReporter } from '../daemon-reporter.js'
import { Daemon } from '../daemon.js'
import { LeaderLock } from '../leader-lock.js'
import { run } from '../run.js'
import { Supervision } from '../supervision-preset.js'
import { oneForOne } from '../supervisor.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

const Feature = makeFeature({ it, layer })

Feature('Leader daemon never surrenders under sustained failure')
  .withScenarioLayer(TestClock.defaultTestClock)
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
                work: new SimulatedFailure(),
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
              const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, s.spy.reporter))
              yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))

              yield* TestClock.adjust(Duration.minutes(10))
              const early = (yield* s.spy.getRestarts()).filter((r) => r.name === 'never-surrender-sup').length
              yield* TestClock.adjust(Duration.minutes(30))
              const late = (yield* s.spy.getRestarts()).filter((r) => r.name === 'never-surrender-sup').length
              return { early, late }
            }),
        ),
        Then('the leader restarted the process at least once within the first 10 minutes')((s) =>
          Effect.sync(() => {
            expect(s.result.early).toBeGreaterThan(0)
          })
        ),
        And('the leader continues restarting the process beyond 40 minutes')((s) =>
          Effect.sync(() => {
            expect(s.result.late).toBeGreaterThan(s.result.early)
          })
        ),
      ),
    )
  })
