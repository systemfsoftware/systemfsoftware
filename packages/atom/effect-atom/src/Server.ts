/**
 * Server-side `Atom` helpers.
 *
 * This module holds the parts of `Atom` that describe how to read atom values
 * on the server: the server-value type id, the read-override combinators, and
 * the registry getter that honors them. All exports are re-exported from
 * `Atom` so consumers keep importing everything from there.
 *
 * @since 4.0.0
 */
import { constant, dual } from 'effect/Function'
import type { Atom, Type } from './Atom.js'
import * as Registry from './Registry.js'
import * as AsyncResult from './Result.js'

type AnyAtom<A = unknown> = Atom<A>
type AnyAsyncResultAtom<A = unknown, E = unknown> = Atom<AsyncResult.Result<A, E>>

/**
 * The type id used to mark atoms with a server-side read override.
 *
 * @since 4.0.0
 */
export const ServerValueTypeId = '~effect-atom/atom/Atom/ServerValue' as const

/**
 * Server-side read override attached to an atom by `withServerValue`.
 *
 * @since 4.0.0
 */
export type ServerValue<A> = {
  readonly [ServerValueTypeId]: (get: <A2>(atom: Atom<A2>) => A2) => A
}

const isServerValue = <A>(self: Atom<A>): self is Atom<A> & ServerValue<A> => ServerValueTypeId in self

/**
 * Sets the value of an Atom when read on the server.
 *
 * @since 4.0.0
 */
export const withServerValue: {
  <A extends AnyAtom>(read: (get: <A2>(atom: Atom<A2>) => A2) => Type<A>): (self: A) => A
  <A extends AnyAtom>(self: A, read: (get: <A2>(atom: Atom<A2>) => A2) => Type<A>): A
} = dual(
  2,
  <A extends AnyAtom>(self: A, read: (get: <A2>(atom: Atom<A2>) => A2) => Type<A>): A => {
    const copy = { ...self, [ServerValueTypeId]: read }
    Reflect.setPrototypeOf(copy, Reflect.getPrototypeOf(self))
    return copy
  },
)

/**
 * Sets an `AsyncResult` atom's server-side value to
 * `AsyncResult.initial(true)`.
 *
 * @since 4.0.0
 */
export const withServerValueInitial = <A extends AnyAsyncResultAtom>(self: A): A => {
  const copy = { ...self, [ServerValueTypeId]: constant(AsyncResult.initial(true)) }
  Reflect.setPrototypeOf(copy, Reflect.getPrototypeOf(self))
  return copy
}

/**
 * Reads an atom from a registry, using its server-side read override when one is
 * present.
 *
 * **Details**
 *
 * Nested reads performed by the override are resolved against the same registry.
 *
 * @since 4.0.0
 */
export const getServerValue: {
  (registry: Registry.Registry): <A>(self: Atom<A>) => A
  <A>(self: Atom<A>, registry: Registry.Registry): A
} = dual(
  2,
  <A>(self: Atom<A>, registry: Registry.Registry): A => {
    if (isServerValue(self)) {
      return self[ServerValueTypeId]((atom) => Registry.get(registry, atom))
    }
    return Registry.get(registry, self)
  },
)
