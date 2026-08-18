import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Duration, Effect, Layer, Option, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { DaemonReporter } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/mod.js'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

const Feature = makeFeature({ it, layer })
Feature('Per-supervisor reporter hooks')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Supervisor reporter hook runs alongside global reporter on restart',
      Gherkin.Do.pipe(
        Given('a global reporter spy')('spy', () => ReporterSpyContext),
        Given('a supervisor-local restart hook tracker')(
          'localRestarts',
          () => Ref.make<readonly Cause.Cause<unknown>[]>([]),
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
        Then('the global reporter recorded one restart for the supervisor')((s) =>
          Effect.sync(() => {
            const g = s.result.globalRestarts.filter((r) => r.name === 'hook-restart-sup')
            expect(g).toHaveLength(1)
          })
        ),
        And('the supervisor-local restart hook recorded the same restart cause')((s) =>
          Effect.sync(() => {
            const gOpt = Option.fromNullishOr(
              s.result.globalRestarts.find((r) => r.name === 'hook-restart-sup'),
            )
            expect(Option.isSome(gOpt)).toBe(true)
            expect(s.result.local).toHaveLength(1)
            if (Option.isNone(gOpt)) {
              throw new Error('expected global restart entry for hook-restart-sup')
            }
            expect(s.result.local[0]).toBe(gOpt.value.cause)
          })
        ),
      ),
    )

    scenario(
      'Supervisor reporter hook runs alongside global reporter on exhaustion',
      Gherkin.Do.pipe(
        Given('a global reporter spy')('spy', () => ReporterSpyContext),
        Given('a supervisor-local exhaustion hook tracker')(
          'localExhaustions',
          () => Ref.make<readonly Cause.Cause<unknown>[]>([]),
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
        Then('the global reporter recorded one exhaustion for the supervisor')((s) =>
          Effect.sync(() => {
            const g = s.result.globalExhaustions.filter((e) => e.name === 'hook-exhaust-sup')
            expect(g).toHaveLength(1)
          })
        ),
        And('the supervisor-local exhaustion hook recorded the same exhaustion cause')((s) =>
          Effect.sync(() => {
            const gOpt = Option.fromNullishOr(
              s.result.globalExhaustions.find((e) => e.name === 'hook-exhaust-sup'),
            )
            expect(Option.isSome(gOpt)).toBe(true)
            expect(s.result.local).toHaveLength(1)
            if (Option.isNone(gOpt)) {
              throw new Error('expected global exhaustion entry for hook-exhaust-sup')
            }
            expect(s.result.local[0]).toBe(gOpt.value.cause)
          })
        ),
      ),
    )
  })
