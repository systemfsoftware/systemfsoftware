import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Ref, Result, Schedule } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { NoopLayer } from './__fixtures__/SharedLayers.js'
import { CounterRef } from './__fixtures__/TestUtils.js'

const Feature = makeFeature({ it, layer })

Feature('Poll Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Executes repeatedly on interval',
      Gherkin.Do.pipe(
        Given('a counter')('counterRef', () => CounterRef.make),
        When('a poll worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'repeater',
              work: CounterRef.increment(s.counterRef),
              interval: Duration.millis(10),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(110))
            return health
          })),
        Then('counter is at least 3')((s) =>
          CounterRef.read(s.counterRef).pipe(
            Effect.flatMap((count) =>
              Effect.sync(() => {
                expect(count).toBeGreaterThanOrEqual(3)
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'Becomes ready after the first successful tick',
      Gherkin.Do.pipe(
        Given('a counter')('counterRef', () => CounterRef.make),
        When('a poll worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'ready-opener',
              work: CounterRef.increment(s.counterRef),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            return health
          })),
        Then('ready is open')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'Pauses when pause gate closed, resumes when opened',
      Gherkin.Do.pipe(
        Given('a counter')('counterRef', () => CounterRef.make),
        When('a poll worker is started and paused immediately')('result', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'pausable',
              work: CounterRef.increment(s.counterRef),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            const countBeforePause = yield* CounterRef.read(s.counterRef)
            yield* health.paused.close
            yield* Effect.yieldNow
            yield* TestClock.adjust(Duration.millis(50))
            const countWhilePaused = yield* CounterRef.read(s.counterRef)
            expect(countWhilePaused).toBe(countBeforePause)
            yield* health.paused.open
            yield* Effect.yieldNow
            yield* TestClock.adjust(Duration.millis(50))
            const countAfterResume = yield* CounterRef.read(s.counterRef)
            expect(countAfterResume).toBeGreaterThan(countWhilePaused)
            return { health }
          })),
      ),
    )

    scenario(
      'Worker stops after a tick fails when no retry policy is configured',
      Gherkin.Do.pipe(
        When('a failing poll worker is started')('health', () =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'failer',
              work: Effect.fail('boom'),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            return health
          })),
        Then('ready stays closed')((s) =>
          s.health.ready.await.pipe(
            Effect.timeout('0 millis'),
            Effect.result,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(Result.isFailure(result)).toBe(true)
              })
            ),
            Effect.asVoid,
          )
        ),
      ),
    )

    scenario(
      'Worker stops when a tick exceeds the default 90s tick timeout',
      Gherkin.Do.pipe(
        When('a slow poll worker is started')('health', () =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'slow',
              work: Effect.sleep(Duration.seconds(100)),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.seconds(91))
            return health
          })),
        Then('ready stays closed')((s) =>
          s.health.ready.await.pipe(
            Effect.timeout('0 millis'),
            Effect.result,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(Result.isFailure(result)).toBe(true)
              })
            ),
            Effect.asVoid,
          )
        ),
      ),
    )

    scenario(
      'Inner retry keeps worker alive on transient failures',
      Gherkin.Do.pipe(
        When('a poll worker with innerRetry is started')('health', () =>
          Effect.gen(function*() {
            const failCounter = yield* Ref.make(0)
            const worker = Daemon.poll({
              name: 'retrying',
              work: Effect.gen(function*() {
                const n = yield* Ref.get(failCounter)
                if (n < 2) {
                  yield* Ref.update(failCounter, (c) => c + 1)
                  return yield* Effect.fail(`failing tick ${n + 1} of 2`)
                }
                return 'ok'
              }),
              interval: Duration.millis(1),
              tickHooks: { innerRetry: Schedule.recurs(2) },
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(50))
            return health
          })),
        Then('ready is open after retry succeeds')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'Worker stops when innerRetry attempts each exceed the per-tick timeout',
      Gherkin.Do.pipe(
        When('a poll worker with short timeout and innerRetry is started')('health', () =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'timeout-retry',
              work: Effect.sleep(Duration.seconds(5)),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.millis(100) },
              tickHooks: { innerRetry: Schedule.recurs(1) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(300))
            return health
          })),
        Then('ready stays closed after both retry attempts timeout')((s) =>
          s.health.ready.await.pipe(
            Effect.timeout('0 millis'),
            Effect.result,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(Result.isFailure(result)).toBe(true)
              })
            ),
            Effect.asVoid,
          )
        ),
      ),
    )
  })
