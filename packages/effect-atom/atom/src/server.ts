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
import type { Registry } from './Registry.js'
import * as AsyncResult from './Result.js'

/**
 * The type id used to mark atoms with a server-side read override.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const ServerValueTypeId = '~effect-atom/atom/Atom/ServerValue' as const

/**
 * Server-side read override attached to an atom by `withServerValue`.
 *
 * @category models
 * @since 4.0.0
 */
export type ServerValue<A> = {
  readonly [ServerValueTypeId]: (get: <A>(atom: Atom<A>) => A) => A
}

const isServerValue = <A>(self: Atom<A>): self is Atom<A> & ServerValue<A> => ServerValueTypeId in self

/**
 * Sets the value of an Atom when read on the server.
 *
 * @category transforming
 * @since 4.0.0
 */
export const withServerValue: {
  <A extends Atom<any>>(read: (get: <A>(atom: Atom<A>) => A) => Type<A>): (self: A) => A
  <A extends Atom<any>>(self: A, read: (get: <A>(atom: Atom<A>) => A) => Type<A>): A
} = dual(
  2,
  <A extends Atom<any>>(self: A, read: (get: <A>(atom: Atom<A>) => A) => Type<A>): A =>
    Object.assign(Object.create(Object.getPrototypeOf(self)), {
      ...self,
      [ServerValueTypeId]: read,
    }),
)

/**
 * Sets an `AsyncResult` atom's server-side value to
 * `AsyncResult.initial(true)`.
 *
 * @category transforming
 * @since 4.0.0
 */
export const withServerValueInitial = <A extends Atom<AsyncResult.Result<any, any>>>(self: A): A =>
  Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    [ServerValueTypeId]: constant(AsyncResult.initial(true)),
  })

/**
 * Reads an atom from a registry, using its server-side read override when one is
 * present.
 *
 * **Details**
 *
 * Nested reads performed by the override are resolved against the same registry.
 *
 * @category getters
 * @since 4.0.0
 */
export const getServerValue: {
  (registry: Registry): <A>(self: Atom<A>) => A
  <A>(self: Atom<A>, registry: Registry): A
} = dual(
  2,
  <A>(self: Atom<A>, registry: Registry): A =>
    isServerValue(self)
      ? self[ServerValueTypeId]((atom: Atom<any>) => registry.get(atom))
      : registry.get(self),
)
