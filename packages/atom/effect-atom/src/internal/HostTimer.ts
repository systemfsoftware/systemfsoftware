/**
 * Host clock and timer primitives for the atom registry.
 *
 * This module is the named host boundary for wall-clock reads and delayed
 * scheduling. The registry itself is a fiber-free store, and consumers who
 * need deterministic idle eviction pass their own `now` / `scheduleTimer` to
 * `Registry.make` / `Registry.layerOptions`. The defaults here route through
 * the Effect-native primitives — the default `Clock` reference's wall clock,
 * resolved once per registry, and `Effect.sleep` forked on the default
 * runtime — so a caller who does not configure scheduling still lands on the
 * platform's clock without this boundary holding module state or reaching for
 * the `Date` or timer globals directly.
 *
 * @since 4.0.0
 */
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { dual } from 'effect/Function'

/** @internal */
export const makeHostNow = (): () => number => {
  const clock = Clock.Clock.defaultValue()
  return () => clock.currentTimeMillisUnsafe()
}

/** @internal */
export const hostScheduleTimer: {
  (delayMillis: number): (f: () => void) => () => void
  (f: () => void, delayMillis: number): () => void
} = dual(
  2,
  (f: () => void, delayMillis: number): () => void => {
    const fiber = Effect.runFork(Effect.andThen(Effect.sleep(delayMillis), Effect.sync(f)))
    return () => {
      Effect.runFork(fiber.pipe(Fiber.interrupt))
    }
  },
)
