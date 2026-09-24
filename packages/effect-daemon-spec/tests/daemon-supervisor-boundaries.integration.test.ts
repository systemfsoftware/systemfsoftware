import { BoundedIntensity } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { dynamic } from '@systemfsoftware/effect-daemon-spec'
import { DaemonReporter } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { MaxChildren } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schedule, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { SimulatedFailure } from './__fixtures__/SimulatedFailure.schema.js'

type SpyHandle = Effect.Success<typeof ReporterSpyContext>

const IntensitySpyLayer = (spy: SpyHandle) =>
  Layer.mergeAll(
    LeaderLock.Noop,
    Layer.succeed(DaemonReporter, {
      onRestart: spy.reporter.onRestart,
      onExhausted: spy.reporter.onExhausted,
    }),
  )

const Feature = makeFeature({ it })

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
        When('a child is started, stopped, then stopped again')('counts', (s) =>
          Effect.gen(function*() {
            const ref = yield* s.handle.startChild(void 0)
            const afterStart = yield* s.handle.count
            yield* s.handle.stopChild(ref)
            yield* ref.removed
            const afterStop = yield* s.handle.count
            yield* s.handle.stopChild(ref)
            const afterSecondStop = yield* s.handle.count
            return { afterStart, afterStop, afterSecondStop }
          })),
        Then('the count rises to one on start, returns to zero on stop, and stays there on a second stop')((
          s,
          expect,
        ) => expect(s.counts).toEqual({ afterStart: 1, afterStop: 0, afterSecondStop: 0 })),
      ),
    )

    scenario(
      'Stream worker terminates when a tick exceeds the timeout',
      Gherkin.Do.pipe(
        When('a stream worker with a silent stream runs past the tick timeout')('observed', () =>
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
              return { count: yield* handle.count }
            }),
          )),
        Then('the worker child is removed after the tick timeout fires')((s, expect) =>
          expect(s.observed.count).toBe(0)
        ),
      ),
    )

    scenario(
      'Subscription worker terminates when a tick exceeds the timeout',
      Gherkin.Do.pipe(
        When('a subscription worker with a slow acquire runs past the tick timeout')('observed', () =>
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
              return { count: yield* handle.count }
            }),
          )),
        Then('the worker child is removed after the tick timeout fires')((s, expect) =>
          expect(s.observed.count).toBe(0)
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
              work: SimulatedFailure.make(),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'zero-budget-sup',
              children: [child],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(5)).pipe(
                  Schedule.upTo({ duration: Duration.millis(50) }),
                ),
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
        Then('the budget is exceeded on the first failure with no restart')((s, expect) =>
          expect({
            restarts: s.result.restarts.map((r) => r.name),
            exhaustions: s.result.exhaustions.map((e) => e.name),
          }).toEqual({ restarts: [], exhaustions: ['zero-budget-sup'] })
        ),
      ),
    )
  })
