/**
 * The `Hydration` namespace barrel.
 *
 * `dehydrate`, `hydrate` and the dehydrated-state types are operations of the
 * `Registry` handle, so they live in `./registry.handle.js`, the module that
 * declares the handle. This module keeps the `Atom.Hydration` namespace
 * importable where it was.
 *
 * @since 4.0.0
 */
export { dehydrate, hydrate } from './registry.handle.js'
export type { DehydratedAtom, DehydratedAtomValue, HydrationEntry } from './registry.handle.js'
