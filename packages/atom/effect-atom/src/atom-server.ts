/**
 * Server-side `Atom` helpers.
 *
 * This module holds the registry getter that honours an atom's server-side read:
 * `getServerValue` reads an atom from a registry through its `serverValue` target
 * when one is present, and falls back to the registry's own read otherwise. All
 * exports are re-exported from `Atom` so consumers keep importing everything from
 * there.
 *
 * @since 4.0.0
 */
import { dual } from 'effect/Function'
import type { Atom } from './atom.blueprint.js'
import * as Registry from './registry.handle.js'

export const getServerValue: {
  (registry: Registry.Registry): <A>(self: Atom<A>) => A
  <A>(self: Atom<A>, registry: Registry.Registry): A
} = dual(
  2,
  <A>(self: Atom<A>, registry: Registry.Registry): A => {
    const read = self.serverValue
    if (read !== undefined) {
      return read((atom) => Registry.get(registry, atom))
    }
    return Registry.get(registry, self)
  },
)
