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
export const hostNow = (): number => Date.now()

export const hostScheduleTimer = (f: () => void, delayMillis: number): () => void => {
  const id = setTimeout(f, delayMillis)
  return () => clearTimeout(id)
}
