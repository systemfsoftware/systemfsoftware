import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schedule, Schema as S, Stream, TestClock } from 'effect'
import { expect } from 'vitest'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { dynamic } from '../src/mod.js'
import { DaemonReporter } from '../src/mod.js'
import { LeaderLock } from '../src/mod.js'
import { MaxChildren } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/mod.js'
import { ReporterSpyContext } from './helpers/reporter-spy.js'
import { NoopLayer } from './helpers/shared-layers.js'

class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}

type SpyHandle = Effect.Effect.Success<typeof ReporterSpyContext>

const IntensitySpyLayer = (spy: SpyHandle) =>
  Layer.mergeAll(
    LeaderLock.Noop,
    Layer.succeed(DaemonReporter, {
      onRestart: spy.reporter.onRestart,
      onExhausted: spy.reporter.onExhausted,
    }),
  )

const Feature = makeFeature({ it, layer })

Feature('Daemon supervisor boundaries')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Double stop on the same child ref never drives the count below zero',
      Gherkin.Do.pipe(
        Given('a dynamic supervisor with a noop poll child')('handle', () =>
          Effect.gen(function*() {
            const spec = dynamic({
              name: 'underflow-test',
              child: () =>
                Daemon.poll({
                  name: 'underflow-child',
                  work: Effect.void,
                  interval: Duration.seconds(10),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              maxChildren: MaxChildren.make(10),
            })
            return yield* run.dynamic(spec)
          })),
        When('a child is started, stopped, then stopped again')('count', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            expect(yield* s.handle.count).toBe(1)
            yield* s.handle.stopChild(ref)
            yield* ref.removed
            expect(yield* s.handle.count).toBe(0)
            yield* s.handle.stopChild(ref)
            return yield* s.handle.count
          })),
        Then('the count stays at zero')((s) =>
          Effect.sync(() => {
            expect(s.count).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'Stream worker terminates when a tick exceeds the timeout',
      Gherkin.Do.pipe(
        When('a stream worker with a silent stream runs past the tick timeout')('removed', () =>
          Effect.scoped(
            Effect.gen(function*() {
              const worker = Daemon.stream({
                name: 'stream-timeout-test',
                stream: Stream.fromEffect(Effect.sleep(Duration.seconds(100))),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const spec = dynamic({
                name: 'stream-timeout-sup',
                child: () => worker,
                maxChildren: MaxChildren.make(1),
              })
              const handle = yield* run.dynamic(spec)
              const ref = yield* handle.startChild(void 0)
              yield* TestClock.adjust(Duration.seconds(91))
              yield* ref.removed
              return true
            }),
          )),
        Then('the worker child is removed after the tick timeout fires')((s) =>
          Effect.sync(() => {
            expect(s.removed).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Subscription worker terminates when a tick exceeds the timeout',
      Gherkin.Do.pipe(
        When('a subscription worker with a slow acquire runs past the tick timeout')('removed', () =>
          Effect.scoped(
            Effect.gen(function*() {
              const worker = Daemon.subscription({
                name: 'sub-timeout-test',
                acquire: Effect.sleep(Duration.seconds(100)),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const spec = dynamic({
                name: 'sub-timeout-sup',
                child: () => worker,
                maxChildren: MaxChildren.make(1),
              })
              const handle = yield* run.dynamic(spec)
              const ref = yield* handle.startChild(void 0)
              yield* TestClock.adjust(Duration.seconds(91))
              yield* ref.removed
              return true
            }),
          )),
        Then('the worker child is removed after the tick timeout fires')((s) =>
          Effect.sync(() => {
            expect(s.removed).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'isExceeded reflects a recorded restart against the budget',
      Gherkin.Do.pipe(
        Given('a oneForOne supervisor with a zero-restart intensity budget')('ctx', () =>
          Effect.gen(function*() {
            const spy = yield* ReporterSpyContext
            return { spy }
          })),
        When('a child always fails under the zero-restart budget')('result', (s) =>
          Effect.gen(function*() {
            const child = Daemon.poll({
              name: 'zero-budget-fail',
              work: new SimulatedFailure(),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'zero-budget-sup',
              children: [child],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(Schedule.upTo(Duration.millis(50))),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            yield* run.supervisor(sup).pipe(Effect.provide(IntensitySpyLayer(s.ctx.spy)))
            yield* TestClock.adjust(Duration.millis(200))
            const restarts = yield* s.ctx.spy.getRestarts()
            const exhaustions = yield* s.ctx.spy.getExhaustions()
            return { restarts, exhaustions }
          })),
        Then('the budget is exceeded on the first failure with no restart')((s) =>
          Effect.sync(() => {
            const matching = s.result.restarts.filter((r) => r.name === 'zero-budget-sup')
            expect(matching.length).toBe(0)
            const exhaustions = s.result.exhaustions.filter((e) => e.name === 'zero-budget-sup')
            expect(exhaustions).toHaveLength(1)
          })
        ),
      ),
    )
  })
