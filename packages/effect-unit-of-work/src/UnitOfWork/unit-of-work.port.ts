import type { Effect } from 'effect'
import type { StoreUnavailable } from './StoreUnavailable.schema.js'
import type { Unit } from './unit.handle.js'

/**
 * The one operation an adapter exposes: run a callback over a freshly minted unit, and add
 * `StoreUnavailable` to the callback's error channel. A caller hands a function of the unit, never
 * an effect built outside it, so a read and the write that depends on it share one unit.
 */
export interface UnitOfWork<D> {
  <A, E, R>(f: (unit: Unit<D>) => Effect.Effect<A, E, R>): Effect.Effect<A, E | StoreUnavailable, R>
}
