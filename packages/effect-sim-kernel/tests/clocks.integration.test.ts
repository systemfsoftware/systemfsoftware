import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Clock, Duration, Effect, Exit, Fiber, Layer, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { alwaysLast, completedValueOf, deadlockOf, escapeOf } from './__fixtures__/kernelFixtures.js'

const Feature = makeFeature({ it })

const TEST_CLOCK = 91_000
const ONE_HOUR = 3_600_000

/**
 * A worker that finishes after 90 virtual seconds while its 100-second sleep
 * has not, moved 91 seconds before the worker starts.
 */
const pastTimeoutWorker = Effect.gen(function*() {
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

/** A five-second wait and a ten-second wait, moved together by ten seconds. */
const fiveAndTenSecondWaits = Effect.gen(function*() {
  const events: Array<string> = []
  const first = Effect.gen(function*() {
    yield* Effect.sleep(Duration.seconds(5))
    yield* Effect.sync(() => events.push('the five-second wait finished'))
    yield* Effect.yieldNow
    yield* Effect.sync(() => events.push('the five-second wait finished its follow-up work'))
  })
  const second = Effect.gen(function*() {
    yield* Effect.sleep(Duration.seconds(10))
    yield* Effect.sync(() => events.push('the ten-second wait finished'))
  })
  yield* Effect.forkChild(first)
  yield* Effect.forkChild(second)
  yield* TestClock.adjust(Duration.seconds(10))
  return events
})

/** A ten-second sleep on a hand-built clock that is never moved. */
const neverMovedSleep = Effect.provide(
  Effect.as(Effect.sleep(Duration.seconds(10)), 'slept on a hand-built clock'),
  TestClock.layer(),
)

/** A one-hour move beside a wait that is not due for two hours. */
const idleMove = Effect.gen(function*() {
  const events: Array<string> = []
  const late = Effect.gen(function*() {
    yield* Effect.sleep(Duration.seconds(7200))
    yield* Effect.sync(() => events.push('the late wait finished'))
  })
  yield* Effect.forkChild(late)
  yield* TestClock.adjust(Duration.hours(1))
  const now = yield* Clock.currentTimeMillis
  return { events, now }
})

Feature('Waiting until nothing moves, then moving virtual time')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A worker that outlasts its own timeout is stopped once time passes the timeout',
      Gherkin.Do.pipe(
        Given('a worker with a 90-second timeout whose work sleeps for 100 seconds')(
          'program',
          () => Effect.succeed(pastTimeoutWorker),
        ),
        When('the worker runs while time moves 91 seconds')(
          'run',
          (s) =>
            Effect.promise(() =>
              s.program.pipe(
                Effect.provide(Kernel.TestClock.layer),
                Kernel.run({ choose: alwaysLast }),
              )
            ),
        ),
        Then('the timeout stops the worker before the move completes')((s) => {
          expect(completedValueOf(s.run).removed).toBe(true)
        }),
        And('the move lands at 91 seconds')((s) => {
          expect(completedValueOf(s.run).now).toBe(TEST_CLOCK)
        }),
      ),
    )

    scenario(
      'Work woken by the five-second wait finishes before the ten-second wait fires',
      Gherkin.Do.pipe(
        Given('a five-second wait and a ten-second wait')(
          'program',
          () => Effect.succeed(fiveAndTenSecondWaits),
        ),
        When('both waits run while time moves ten seconds')(
          'run',
          (s) => Effect.promise(() => Kernel.run(Effect.provide(s.program, Kernel.TestClock.layer))),
        ),
        Then('the woken work finishes before the ten-second wait fires')((s) => {
          expect(completedValueOf(s.run)).toEqual([
            'the five-second wait finished',
            'the five-second wait finished its follow-up work',
            'the ten-second wait finished',
          ])
        }),
      ),
    )

    scenario(
      'A sleep on a hand-built clock that is never moved stays stuck instead of escaping',
      Gherkin.Do.pipe(
        Given('a ten-second sleep on a hand-built clock')(
          'program',
          () => Effect.succeed(neverMovedSleep),
        ),
        When('the sleep runs with the clock never moved')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.program)),
        ),
        Then('the run reports the sleep as stuck')((s) => {
          expect(deadlockOf(s.run).suspended.length).toBeGreaterThanOrEqual(1)
        }),
        And('no timer escape is reported')((s) => {
          expect(() => escapeOf(s.run)).toThrow('expected a timer escape, got another failure')
        }),
      ),
    )

    scenario(
      'A move with nothing due lands the clock without waking anything',
      Gherkin.Do.pipe(
        Given('a wait that is not due for two hours')(
          'program',
          () => Effect.succeed(idleMove),
        ),
        When('time moves one hour with nothing due')(
          'run',
          (s) => Effect.promise(() => Kernel.run(Effect.provide(s.program, Kernel.TestClock.layer))),
        ),
        Then('the move lands at one hour')((s) => {
          expect(completedValueOf(s.run).now).toBe(ONE_HOUR)
        }),
        And('the late wait is still asleep')((s) => {
          expect(completedValueOf(s.run).events).toEqual([])
        }),
      ),
    )
  })
