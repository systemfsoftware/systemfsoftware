/**
 * The kernel's controllable test clock (R37): what a harness provides in place
 * of `TestClock.layer()`. Programs keep calling Effect's `TestClock` API —
 * `adjust` and `setTime` reach this clock through the `Clock` service — but
 * they suspend the caller, and the kernel moves time only when nothing can
 * run, firing due sleeps in timestamp order with everything they wake run to a
 * stop between them.
 */
import { Clock, Context, Duration, Effect, Layer } from 'effect'

import { kernelTestClock } from '../internal/clocks.js'

/**
 * The test-clock service a scenario reaches through the `Clock` service and
 * Effect's own `TestClock` helpers.
 */
export interface TestClock extends Clock.Clock {
  /**
   * Increments the current clock time by the specified duration. Sleeps due on
   * or before the new time fire in timestamp order, each batch's woken work
   * running to a stop before the next batch.
   */
  adjust(duration: Duration.Input): Effect.Effect<void>
  /** Sets the current clock time to the specified timestamp. */
  setTime(timestamp: number): Effect.Effect<void>
  /** Runs the effect with the kernel's root clock instead of the test clock. */
  withLive<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
}

/**
 * Builds the run's test clock and registers it with the kernel, so the run
 * settles its requests only when nothing else can run. Only available inside a
 * kernel run.
 */
export const make: Effect.Effect<TestClock> = kernelTestClock

const contextOf = (testClock: TestClock): Context.Context<Clock.Clock> =>
  Context.makeUnsafe<Clock.Clock>(new Map([[Clock.Clock.key, testClock]]))

/** The layer a harness provides in place of `TestClock.layer()`. */
export const layer: Layer.Layer<Clock.Clock> = Layer.effectContext(Effect.map(make, contextOf))
