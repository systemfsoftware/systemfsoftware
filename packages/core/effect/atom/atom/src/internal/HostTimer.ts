/**
 * Host clock and timer primitives for the atom registry.
 *
 * This module is the named host boundary for wall-clock reads and delayed
 * scheduling. It deliberately imports nothing from `effect`: the registry
 * itself is a fiber-free store, and consumers who need deterministic idle
 * eviction pass their own `now` / `scheduleTimer` to `Registry.make` /
 * `Registry.layerOptions`. The defaults here are the plain platform
 * implementations.
 *
 * @since 4.0.0
 */
// The two diagnostics below are disabled for this module and nowhere else. The
// Effect answers - `Clock` and `Effect.sleep`/`Schedule` - both require a fiber,
// and this module exists precisely because the registry has none: it is a
// fiber-free store, and a consumer who needs deterministic time passes its own
// `now` / `scheduleTimer` to `Registry.make`. These are the platform defaults for
// a caller who does not. Moving them into Effect would put a runtime under every
// registry read, which is the design this file is the boundary of.
/** @internal */
// @effect-diagnostics-next-line globalDate:off
export const hostNow = (): number => Date.now()

/** @internal */
export const hostScheduleTimer = (f: () => void, delayMillis: number): () => void => {
  // @effect-diagnostics-next-line globalTimers:off
  const id = setTimeout(f, delayMillis)
  return () => clearTimeout(id)
}
