import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Exit, Fiber, Stream, TestClock } from 'effect'
import { expect } from 'vitest'
import { BoundedIntensity } from '../daemon-policy.schema.js'
import { Daemon } from '../daemon.js'
import { allocateWorkerHealth } from '../internal/boot.js'
import { make as makeIntensity } from '../internal/intensity.js'
import { buildWorkerLoop } from '../internal/worker-loop.js'
import { run } from '../run.js'
import { dynamic } from '../supervisor.js'
import { NoopLayer } from './helpers/shared-layers.js'

it.effect('Should_CountNeverGoBelowZero_When_DoubleStopOnSameRef', () =>
  Effect.scoped(
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
        maxChildren: 10,
      })
      const handle = yield* run.dynamic(spec).pipe(Effect.provide(NoopLayer))

      const ref = yield* handle.startChild(void 0)
      expect(yield* handle.count).toBe(1)

      yield* handle.stopChild(ref)
      yield* ref.removed
      expect(yield* handle.count).toBe(0)

      yield* handle.stopChild(ref)
      expect(yield* handle.count).toBe(0)
    }),
  ).pipe(Effect.provide(NoopLayer)))

it.effect('Should_StreamWorkerTerminate_When_TickTimeoutExceeded', () =>
  Effect.scoped(
    Effect.gen(function*() {
      const health = yield* allocateWorkerHealth('stream-timeout-test')
      const worker = Daemon.stream({
        name: 'stream-timeout-test',
        stream: Stream.fromEffect(Effect.sleep(Duration.seconds(100))),
        tick: { tickTimeout: Duration.seconds(90) },
        lock: { mode: 'none' },
      })
      const loop = buildWorkerLoop(worker, health)

      const fiber = yield* Effect.fork(loop)
      yield* Effect.yieldNow()

      yield* TestClock.adjust(Duration.seconds(91))
      yield* Effect.yieldNow()

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isSuccess(exit)).toBe(false)
      expect(exit._tag).toBe('Failure')
    }),
  ))

it.effect('Should_SubscriptionWorkerTerminate_When_TickTimeoutExceeded', () =>
  Effect.scoped(
    Effect.gen(function*() {
      const health = yield* allocateWorkerHealth('sub-timeout-test')
      const worker = Daemon.subscription({
        name: 'sub-timeout-test',
        acquire: Effect.sleep(Duration.seconds(100)),
        tick: { tickTimeout: Duration.seconds(90) },
        lock: { mode: 'none' },
      })
      const loop = buildWorkerLoop(worker, health)

      const fiber = yield* Effect.fork(loop)
      yield* Effect.yieldNow()

      yield* TestClock.adjust(Duration.seconds(91))
      yield* Effect.yieldNow()

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isSuccess(exit)).toBe(false)
      expect(exit._tag).toBe('Failure')
    }),
  ))

it.effect('Should_ConcurrentRecordAndCountBeConsistent_When_ForkedRecordInterleaves', () =>
  Effect.gen(function*() {
    yield* TestClock.adjust(0)
    const tracker = yield* makeIntensity(
      new BoundedIntensity({
        restarts: 1,
        window: Duration.seconds(60),
      }),
    )

    yield* tracker.record
    expect(yield* tracker.count).toBe(1)

    const fiber = yield* Effect.fork(tracker.record)
    yield* Effect.yieldNow()

    const countDuring = yield* tracker.count

    yield* Fiber.await(fiber)
    expect(yield* tracker.count).toBe(2)

    expect(countDuring).toBe(2)
  }))

it.effect('Should_IsExceededReflectRecord_When_CalledImmediatelyAfter', () =>
  Effect.gen(function*() {
    yield* TestClock.adjust(0)
    const tracker = yield* makeIntensity(
      new BoundedIntensity({
        restarts: 0,
        window: Duration.seconds(60),
      }),
    )

    yield* tracker.record

    const exceeded = yield* tracker.isExceeded
    expect(exceeded).toBe(true)
  }))
