import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schema as S, TestClock } from 'effect'
import { expect } from 'vitest'
import { LeaderLock, SupervisorBodyExecutorDeps } from '../src/mod.js'
import { WithLeaderLockExecutorLive } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/supervision-policy/supervisor-one-for-one.combinator.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

const Feature = makeFeature({ it, layer })

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
              const reporterLayer = Layer.mergeAll(
                LeaderLock.Noop,
                WithLeaderLockExecutorLive.pipe(Layer.provide(LeaderLock.Noop)),
                Layer.succeed(SupervisorBodyExecutorDeps, {
                  onRestart: s.spy.reporter.onRestart,
                  onExhausted: s.spy.reporter.onExhausted,
                }),
              )
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
