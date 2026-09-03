import { BoundedIntensity } from '@systemfsoftware/effect-daemon-spec'
import { run } from '@systemfsoftware/effect-daemon-spec'
import { DaemonReporter } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Supervision } from '@systemfsoftware/effect-daemon-spec'
import { oneForOne } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Latch, Layer, Ref, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { ReporterSpyContext } from './__fixtures__/ReporterSpy.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it, layer })

const budget = (restarts: number, window: Duration.Duration) =>
  Supervision.custom({
    intensity: BoundedIntensity.make({ restarts, window }),
    backoff: Schedule.exponential(Duration.millis(10), 1),
    cooldown: Duration.minutes(30),
  })

const flakyWorker = (
  name: string,
  attempts: Ref.Ref<number>,
  failures: number,
  gate?: Latch.Latch,
) =>
  Daemon.poll({
    name,
    work: Effect.gen(function*() {
      const n = yield* Ref.updateAndGet(attempts, (c) => c + 1)
      if (n === 2 && gate !== undefined) yield* gate.await
      if (n <= failures) return yield* Effect.fail('boom')
    }),
    interval: Duration.millis(1),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

const supervise = (
  supName: string,
  worker: ReturnType<typeof flakyWorker>,
  restarts: number,
  window: Duration.Duration,
) =>
  Effect.gen(function*() {
    const spy = yield* ReporterSpyContext
    const reporterLayer = Layer.mergeAll(
      LeaderLock.Noop,
      Layer.succeed(DaemonReporter, {
        onRestart: spy.reporter.onRestart,
        onExhausted: spy.reporter.onExhausted,
      }),
    )
    const sup = oneForOne({
      name: supName,
      children: [worker],
      supervision: budget(restarts, window),
      lock: { mode: 'none' },
    })
    const health = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
    return { spy, health }
  })

const isHealthyOpen = (health: { readonly healthy: Latch.Latch }) =>
  health.healthy.await.pipe(
    Effect.timeout('0 millis'),
    Effect.matchEffect({
      onFailure: () => Effect.succeed(false),
      onSuccess: () => Effect.succeed(true),
    }),
  )

Feature('Restart Intensity')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Failures below the threshold keep the supervisor healthy',
      Gherkin.Do.pipe(
        Given('a worker that fails 3 times then recovers')(
          'worker',
          () =>
            Effect.gen(function*() {
              const attempts = yield* Ref.make(0)
              return flakyWorker('below-threshold', attempts, 3)
            }),
        ),
        When('a 5-per-minute supervisor runs it for 2 seconds')(
          'out',
          (s) =>
            Effect.gen(function*() {
              const { spy, health } = yield* supervise(
                'below-threshold-parent',
                s.worker,
                5,
                Duration.seconds(60),
              )
              yield* TestClock.adjust(Duration.seconds(2))
              return {
                exhaustions: yield* spy.getExhaustions(),
                restarts: yield* spy.getRestarts(),
                healthyOpen: yield* isHealthyOpen(health),
              }
            }),
        ),
        Then('no exhaustion is reported and health stays open')((s) =>
          Effect.sync(() => {
            expect(s.out.exhaustions).toHaveLength(0)
            expect(s.out.healthyOpen).toBe(true)
          })
        ),
        And('exactly 3 restarts were counted')((s) =>
          Effect.sync(() => {
            expect(s.out.restarts).toHaveLength(3)
          })
        ),
      ),
    )

    scenario(
      'Failures past the threshold exhaust the supervisor',
      Gherkin.Do.pipe(
        Given('a worker that always fails')(
          'worker',
          () =>
            Effect.gen(function*() {
              const attempts = yield* Ref.make(0)
              return flakyWorker('past-threshold', attempts, 1_000_000)
            }),
        ),
        When('a 3-per-minute supervisor runs it for 2 seconds')(
          'out',
          (s) =>
            Effect.gen(function*() {
              const { spy, health } = yield* supervise(
                'past-threshold-parent',
                s.worker,
                3,
                Duration.seconds(60),
              )
              yield* TestClock.adjust(Duration.seconds(2))
              return {
                exhaustions: yield* spy.getExhaustions(),
                healthyOpen: yield* isHealthyOpen(health),
              }
            }),
        ),
        Then('exhaustion is reported and health closes')((s) =>
          Effect.sync(() => {
            expect(s.out.exhaustions.length).toBeGreaterThanOrEqual(1)
            expect(s.out.healthyOpen).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Failures exactly at the threshold do not exhaust',
      Gherkin.Do.pipe(
        Given('a worker that fails exactly 3 times then recovers')(
          'worker',
          () =>
            Effect.gen(function*() {
              const attempts = yield* Ref.make(0)
              return flakyWorker('at-threshold', attempts, 3)
            }),
        ),
        When('a 3-per-minute supervisor runs it for 2 seconds')(
          'out',
          (s) =>
            Effect.gen(function*() {
              const { spy, health } = yield* supervise(
                'at-threshold-parent',
                s.worker,
                3,
                Duration.seconds(60),
              )
              yield* TestClock.adjust(Duration.seconds(2))
              return {
                exhaustions: yield* spy.getExhaustions(),
                healthyOpen: yield* isHealthyOpen(health),
              }
            }),
        ),
        Then('no exhaustion is reported and health stays open')((s) =>
          Effect.sync(() => {
            expect(s.out.exhaustions).toHaveLength(0)
            expect(s.out.healthyOpen).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A failure prunes out once the window passes',
      Gherkin.Do.pipe(
        Given('a gated worker failing twice and a 1-per-10-seconds supervisor')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const attempts = yield* Ref.make(0)
              const gate = yield* Latch.make(false)
              const worker = flakyWorker('prune-window', attempts, 2, gate)
              const { spy, health } = yield* supervise(
                'prune-window-parent',
                worker,
                1,
                Duration.seconds(10),
              )
              return { gate, spy, health }
            }),
        ),
        When('the first failure restarts and 11 seconds elapse')(
          'mid',
          (s) =>
            Effect.gen(function*() {
              yield* TestClock.adjust(Duration.millis(50))
              const restarts = yield* s.ctx.spy.getRestarts()
              yield* TestClock.adjust(Duration.seconds(11))
              return restarts.length
            }),
        ),
        Then('one restart is counted')((s) =>
          Effect.sync(() => {
            expect(s.mid).toBe(1)
          })
        ),
        When('the gate opens and the second failure restarts')(
          'out',
          (s) =>
            Effect.gen(function*() {
              yield* s.ctx.gate.open
              yield* TestClock.adjust(Duration.millis(500))
              return {
                exhaustions: yield* s.ctx.spy.getExhaustions(),
                healthyOpen: yield* isHealthyOpen(s.ctx.health),
              }
            }),
        ),
        Then('no exhaustion is reported: the first failure left the window')((s) =>
          Effect.sync(() => {
            expect(s.out.exhaustions).toHaveLength(0)
            expect(s.out.healthyOpen).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A failure inside the window edge is retained',
      Gherkin.Do.pipe(
        Given('a gated worker failing twice and a 1-per-10-seconds supervisor')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const attempts = yield* Ref.make(0)
              const gate = yield* Latch.make(false)
              const worker = flakyWorker('edge-window', attempts, 2, gate)
              const { spy, health } = yield* supervise(
                'edge-window-parent',
                worker,
                1,
                Duration.seconds(10),
              )
              return { gate, spy, health }
            }),
        ),
        When('the first failure restarts and 10 seconds elapse in total')(
          'mid',
          (s) =>
            Effect.gen(function*() {
              yield* TestClock.adjust(Duration.millis(50))
              const restarts = yield* s.ctx.spy.getRestarts()
              yield* TestClock.adjust(Duration.millis(9_950))
              return restarts.length
            }),
        ),
        Then('one restart is counted')((s) =>
          Effect.sync(() => {
            expect(s.mid).toBe(1)
          })
        ),
        When('the gate opens and the second failure restarts')(
          'out',
          (s) =>
            Effect.gen(function*() {
              yield* s.ctx.gate.open
              yield* TestClock.adjust(Duration.millis(500))
              return {
                exhaustions: yield* s.ctx.spy.getExhaustions(),
                healthyOpen: yield* isHealthyOpen(s.ctx.health),
              }
            }),
        ),
        Then('exhaustion is reported: the edge failure still counts')((s) =>
          Effect.sync(() => {
            expect(s.out.exhaustions.length).toBeGreaterThanOrEqual(1)
            expect(s.out.healthyOpen).toBe(false)
          })
        ),
      ),
    )
  })
