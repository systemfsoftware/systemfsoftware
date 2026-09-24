/**
 * React hooks for reading and deriving `Atom.Ref` values.
 *
 * @since 4.0.0
 */
'use client'

import { Atom } from '@systemfsoftware/effect-atom'
import { dual } from 'effect/Function'
import * as React from 'react'

/**
 * Subscribes to an atom ref and returns its latest value.
 *
 * **When to use**
 *
 * Use when a React component should render from an `Atom.Ref.ReadonlyRef`
 * directly instead of reading an atom through the current registry.
 *
 * **Details**
 *
 * The hook subscribes with `Atom.Ref.subscribe`, triggers re-renders through
 * React state, and returns the current `Atom.Ref.get(ref)` value.
 *
 * @see {@link useAtomValue} for reading an `Atom` from the current registry
 * @see {@link useAtomRefPropValue} for reading a property ref value
 *
 * @since 4.0.0
 */
export const useAtomRef = <A>(ref: Atom.Ref.ReadonlyRef<A>): A => {
  const [, setValue] = React.useState(() => Atom.Ref.get(ref))
  React.useEffect(() => Atom.Ref.subscribe(ref, setValue), [ref])
  return Atom.Ref.get(ref)
}

/**
 * Returns a memoized atom ref for a property of another atom ref.
 *
 * **When to use**
 *
 * Use to derive an `AtomRef` for one property of an object-shaped atom ref.
 *
 * **Details**
 *
 * The hook memoizes `Atom.Ref.prop(ref, prop)` for the `[ref, prop]`
 * dependency pair and returns the property ref so callers can read, set,
 * update, or subscribe to that nested property.
 * @see {@link useAtomRef} for subscribing to an atom ref value
 * @see {@link useAtomRefPropValue} for subscribing directly to a property value
 *
 * @since 4.0.0
 */
export const useAtomRefProp: {
  <A, K extends keyof A>(prop: K): (ref: Atom.Ref.AtomRef<A>) => Atom.Ref.AtomRef<A[K]>
  <A, K extends keyof A>(ref: Atom.Ref.AtomRef<A>, prop: K): Atom.Ref.AtomRef<A[K]>
} = dual(
  2,
  <A, K extends keyof A>(ref: Atom.Ref.AtomRef<A>, prop: K): Atom.Ref.AtomRef<A[K]> =>
    React.useMemo(() => Atom.Ref.prop(ref, prop), [ref, prop]),
)

/**
 * Subscribes to a property ref derived from an atom ref and returns its current
 * value.
 *
 * **When to use**
 *
 * Use when a React component needs only the current value of one property from
 * an object-shaped `AtomRef`.
 *
 * **Details**
 *
 * The hook composes `useAtomRefProp(ref, prop)` with `useAtomRef`, so the
 * property ref is memoized for the `[ref, prop]` pair and then subscribed
 * through `Atom.Ref.subscribe`.
 *
 * @see {@link useAtomRefProp} for returning the property ref directly
 * @see {@link useAtomRef} for subscribing to a whole atom ref value
 *
 * @since 4.0.0
 */
export const useAtomRefPropValue: {
  <A, K extends keyof A>(prop: K): (ref: Atom.Ref.AtomRef<A>) => A[K]
  <A, K extends keyof A>(ref: Atom.Ref.AtomRef<A>, prop: K): A[K]
} = dual(
  2,
  <A, K extends keyof A>(ref: Atom.Ref.AtomRef<A>, prop: K): A[K] => useAtomRef(useAtomRefProp(ref, prop)),
)
