import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Either, Exit, Fiber, Ref, Schedule, Stream, TestClock } from 'effect'
import { expect } from 'vitest'
import { Daemon } from '../daemon.js'
import { allocateWorkerHealth } from '../internal/boot.js'
import { buildWorkerLoop } from '../internal/worker-loop.js'
import { run } from '../run.js'
import { NoopLayer } from './helpers/shared-layers.js'
import { BufferedRef, CounterRef } from './helpers/test-utils.js'

const Feature = makeFeature({ it, layer })

Feature('Poll Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(TestClock.defaultTestClock)
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
            yield* Effect.yieldNow()
            yield* TestClock.adjust(Duration.millis(50))
            const countWhilePaused = yield* CounterRef.read(s.counterRef)
            expect(countWhilePaused).toBe(countBeforePause)
            yield* health.paused.open
            yield* Effect.yieldNow()
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
            Effect.either,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result).toEqual(Either.left(expect.anything()))
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
            Effect.either,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result).toEqual(Either.left(expect.anything()))
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
              tickHooks: { innerRetry: Schedule.once },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(300))
            return health
          })),
        Then('ready stays closed after both retry attempts timeout')((s) =>
          s.health.ready.await.pipe(
            Effect.timeout('0 millis'),
            Effect.either,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result).toEqual(Either.left(expect.anything()))
              })
            ),
            Effect.asVoid,
          )
        ),
      ),
    )
  })

Feature('Stream Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Drains all elements from source',
      Gherkin.Do.pipe(
        Given('a buffered ref')('buffer', () => BufferedRef.make<number>()),
        When('a stream worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.stream({
              name: 'drainer',
              stream: Stream.make(1, 2, 3).pipe(
                Stream.tap((n) => BufferedRef.append(s.buffer, n)),
              ),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(10))
            return health
          })),
        Then('buffer contains all elements')((s) =>
          BufferedRef.readAll(s.buffer).pipe(
            Effect.flatMap((items) =>
              Effect.sync(() => {
                expect(items).toEqual([1, 2, 3])
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'Becomes ready on the first emitted element',
      Gherkin.Do.pipe(
        Given('a buffered ref')('buffer', () => BufferedRef.make<number>()),
        When('a stream worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.stream({
              name: 'ready-on-first',
              stream: Stream.make(1, 2, 3).pipe(
                Stream.tap((n) => BufferedRef.append(s.buffer, n)),
              ),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(10))
            return health
          })),
        Then('ready is open')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'Stream timeout fails when no element arrives within the timeout window',
      Gherkin.Do.pipe(
        When('a stream worker that never emits is started')('result', () =>
          Effect.gen(function*() {
            const health = yield* allocateWorkerHealth('silent-stream')
            const worker = Daemon.stream({
              name: 'silent-stream',
              stream: Stream.fromEffect(Effect.sleep(Duration.seconds(100))),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const loop = buildWorkerLoop(worker, health)
            const fiber = yield* Effect.forkScoped(loop)
            yield* Effect.yieldNow()
            yield* TestClock.adjust(Duration.seconds(91))
            const exit = yield* Fiber.await(fiber)
            return { exit }
          })),
        Then('worker exit is a failure')((s) =>
          Effect.sync(() => {
            expect(Exit.isSuccess(s.result.exit)).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Stream worker continues running past timeout after first element is received',
      Gherkin.Do.pipe(
        When('a stream worker that emits then blocks is run past timeout')('result', () =>
          Effect.gen(function*() {
            const health = yield* allocateWorkerHealth('long-lived-stream')
            const worker = Daemon.stream({
              name: 'long-lived-stream',
              stream: Stream.make(1).pipe(
                Stream.concat(Stream.fromEffect(Effect.never)),
              ),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const loop = buildWorkerLoop(worker, health)
            const fiber = yield* Effect.forkScoped(loop)
            yield* Effect.yieldNow()
            yield* TestClock.adjust(Duration.seconds(100))
            const result = yield* Fiber.await(fiber).pipe(
              Effect.timeout('0 millis'),
              Effect.either,
            )
            return { stillRunning: Either.isLeft(result) }
          })),
        Then('worker is still running after timeout')((s) =>
          Effect.sync(() => {
            expect(s.result.stillRunning).toBe(true)
          })
        ),
      ),
    )
  })

Feature('Subscription Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Runs acquire when started',
      Gherkin.Do.pipe(
        Given('an acquired ref')('acquiredRef', () => Ref.make(false)),
        When('a subscription worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.subscription({
              name: 'subscriber',
              acquire: Ref.set(s.acquiredRef, true),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            const acquired = yield* Ref.get(s.acquiredRef)
            expect(acquired).toBe(true)
            return health
          })),
        Then('ready is open')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'Closing the pause gate does not stop a running subscription',
      Gherkin.Do.pipe(
        Given('an acquired ref')('acquiredRef', () => Ref.make(false)),
        When('a subscription worker is started then gate is closed')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.subscription({
              name: 'paused-subscriber',
              acquire: Ref.set(s.acquiredRef, true),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(5))
            const acquired = yield* Ref.get(s.acquiredRef)
            expect(acquired).toBe(true)
            yield* health.paused.close
            yield* Effect.yieldNow()
            yield* TestClock.adjust(Duration.millis(5))
            return health
          })),
        Then('ready stays open after gate close')((s) => s.health.ready.await),
      ),
    )
  })
