/**
 * The `Hydration` namespace barrel.
 *
 * The dehydrated-state vocabulary is declared in `./hydration.schema.js`, and the
 * `dehydrate`/`hydrate` operations that walk a registry live in
 * `./registry.handle.js`, the module that declares the handle. This module keeps
 * the `Atom.Hydration` namespace importable where it was.
 *
 * @since 4.0.0
 */
export type { DehydratedAtom, DehydratedAtomValue, HydrationEntry } from './hydration.schema.js'
export { dehydrate, hydrate } from './registry.handle.js'
