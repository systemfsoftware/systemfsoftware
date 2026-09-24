import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Clock, Duration, Effect, Exit, Fiber, Layer, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { alwaysLast, completedValueOf, deadlockOf, escapeOf } from './__fixtures__/kernelFixtures.js'

const Feature = makeFeature({ it, layer })

/**
 * A worker forked with a 90-second tick timeout whose stream sleeps 100
 * seconds, moved by 91 seconds before the worker has started.
 */
const streamWorker = Effect.gen(function*() {
  const worker = Effect.timeout(
    Stream.runCollect(Stream.fromEffect(Effect.sleep(Duration.seconds(100)))),
    Duration.seconds(90),
  )
  const child = yield* Effect.forkChild(worker)
  yield* TestClock.adjust(Duration.seconds(91))
  const now = yield* Clock.currentTimeMillis
  const exit = yield* Fiber.await(child)
  return { now, removed: Exit.isFailure(exit) }
})

/** Two sleepers due at 5 s and 10 s, moved together by one 10-second adjust. */
const twoSleepers = Effect.gen(function*() {
  const events: Array<string> = []
  const first = Effect.gen(function*() {
    yield* Effect.sleep(Duration.seconds(5))
    yield* Effect.sync(() => events.push('the five-second sleeper woke'))
    yield* Effect.yieldNow
    yield* Effect.sync(() => events.push('the five-second sleeper finished its woken work'))
  })
  const second = Effect.gen(function*() {
    yield* Effect.sleep(Duration.seconds(10))
    yield* Effect.sync(() => events.push('the ten-second sleeper woke'))
  })
  yield* Effect.forkChild(first)
  yield* Effect.forkChild(second)
  yield* TestClock.adjust(Duration.seconds(10))
  return events
})

/** A sleeper under the test clock suites provide today, never moved. */
const sleepingUnderTestClock = Effect.provide(
  Effect.as(Effect.sleep(Duration.seconds(10)), 'slept under the test clock'),
  TestClock.layer(),
)

/** A move with nothing due, beside a sleeper not due for two hours. */
const idleClock = Effect.gen(function*() {
  const events: Array<string> = []
  const late = Effect.gen(function*() {
    yield* Effect.sleep(Duration.seconds(7200))
    yield* Effect.sync(() => events.push('the late sleeper woke'))
  })
  yield* Effect.forkChild(late)
  yield* TestClock.adjust(Duration.hours(1))
  const now = yield* Clock.currentTimeMillis
  return { events, now }
})

Feature('Test time that moves only when nothing can run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A worker whose stream outlasts its tick timeout is removed when time moves past the timeout',
      Gherkin.Do.pipe(
        Given('a worker forked with a 90-second tick timeout whose stream sleeps 100 seconds')(
          'run',
          () =>
            Effect.promise(() =>
              streamWorker.pipe(
                Effect.provide(Kernel.TestClock.layer),
                Kernel.run({ choose: alwaysLast }),
              )
            ),
        ),
        Then('the worker is removed by its timeout before the move completes')((s) => {
          expect(completedValueOf(s.run).removed).toBe(true)
        }),
        Then('the move completes with the clock at 91 seconds')((s) => {
          expect(completedValueOf(s.run).now).toBe(91_000)
        }),
      ),
    )

    scenario(
      'Work woken by the five-second sleeper runs to a stop before the ten-second sleeper fires',
      Gherkin.Do.pipe(
        Given('a five-second sleeper and a ten-second sleeper, moved together by ten seconds')(
          'run',
          () => Effect.promise(() => Kernel.run(Effect.provide(twoSleepers, Kernel.TestClock.layer))),
        ),
        Then('the woken work finishes before the ten-second sleeper wakes')((s) => {
          expect(completedValueOf(s.run)).toEqual([
            'the five-second sleeper woke',
            'the five-second sleeper finished its woken work',
            'the ten-second sleeper woke',
          ])
        }),
      ),
    )

    scenario(
      'A sleeper under the test clock suites provide today never reaches a real timer',
      Gherkin.Do.pipe(
        Given('a program asleep for ten seconds under the test clock, never moved')(
          'run',
          () => Effect.promise(() => Kernel.run(sleepingUnderTestClock)),
        ),
        Then('the run is reported as stuck rather than escaping to a timer')((s) => {
          expect(deadlockOf(s.run).suspended.length).toBeGreaterThanOrEqual(1)
        }),
        Then('no timer escape was recorded')((s) => {
          expect(() => escapeOf(s.run)).toThrow('expected a timer escape, got another failure')
        }),
      ),
    )

    scenario(
      'A move with nothing due lands the clock and returns without waking anything',
      Gherkin.Do.pipe(
        Given('a sleeper not due for two hours, beside a one-hour move')(
          'run',
          () => Effect.promise(() => Kernel.run(Effect.provide(idleClock, Kernel.TestClock.layer))),
        ),
        Then('the move lands the clock at one hour')((s) => {
          expect(completedValueOf(s.run).now).toBe(3_600_000)
        }),
        Then('the late sleeper is still asleep')((s) => {
          expect(completedValueOf(s.run).events).toEqual([])
        }),
      ),
    )
  })
