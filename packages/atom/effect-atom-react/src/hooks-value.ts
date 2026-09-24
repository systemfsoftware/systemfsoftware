/**
 * React hooks that read, write, mount, refresh, and subscribe to atoms from
 * the current `RegistryContext`.
 *
 * @since 4.0.0
 */
'use client'

import { Atom } from '@systemfsoftware/effect-atom'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { constVoid, dual } from 'effect/Function'
import * as React from 'react'
import { type AnyAtom, type AnyInitialValue, useRegistry } from './registry-context.js'

function useStore<A>(registry: Atom.Registry.Registry, atom: Atom.Atom<A>): A {
  const subscribe = React.useMemo(
    () => (onStoreChange: () => void) => Atom.Registry.subscribe(registry, atom, () => onStoreChange()),
    [registry, atom],
  )
  return React.useSyncExternalStore(
    subscribe,
    () => Atom.Registry.get(registry, atom),
    () => Atom.getServerValue(atom, registry),
  )
}

type AnyValue<Val = unknown> = Val

class InitialValuesSet extends Context.Service<InitialValuesSet, WeakSet<AnyAtom>>()(
  '@systemfsoftware/effect-atom-react/hooks-value/InitialValuesSet',
) {}

function initialValuesSetFor(
  registry: Atom.Registry.Registry,
): WeakSet<AnyAtom> {
  return Atom.Registry.storage(registry, InitialValuesSet, () => new WeakSet<AnyAtom>())
}

function seedInitialValueIfNew(
  set: WeakSet<AnyAtom>,
  registry: Atom.Registry.Registry,
  atom: AnyAtom,
  value: AnyValue,
): void {
  if (set.has(atom)) {
    return
  }
  set.add(atom)
  Atom.Registry.setInitialValue(registry, atom, value)
}

function seedInitialValues(
  registry: Atom.Registry.Registry,
  initialValues: Iterable<AnyInitialValue>,
): void {
  const set = initialValuesSetFor(registry)
  for (const [atom, value] of initialValues) {
    seedInitialValueIfNew(set, registry, atom, value)
  }
}

/**
 * Seeds initial atom values in the current React atom registry.
 *
 * **When to use**
 *
 * Use to seed atom values from a React component after the current registry
 * already exists.
 *
 * **Gotchas**
 *
 * Each atom is initialized at most once for a given registry by this hook, so
 * later calls for the same atom in that registry are ignored.
 *
 * @since 4.0.0
 */
export const useAtomInitialValues = (initialValues: Iterable<AnyInitialValue>): void => {
  seedInitialValues(useRegistry(), initialValues)
}

/**
 * Subscribes to an atom in the current React registry and returns its current
 * value, optionally mapped through a selector.
 *
 * **When to use**
 *
 * Use when a React component needs to render from an atom value without also
 * returning a setter.
 *
 * **Details**
 *
 * When a selector is provided, the hook maps the atom before subscribing so the
 * component reads the selected value from the current `RegistryContext`.
 *
 * @see {@link useAtom} for reading and updating a writable atom from one component
 * @see `useAtomRef` for reading an `AtomRef` directly
 *
 * @since 4.0.0
 */
export const useAtomValue: {
  <A>(atom: Atom.Atom<A>): A
  <A, B>(atom: Atom.Atom<A>, f: (_: A) => B): B
  <A, B>(f: (_: A) => B): (atom: Atom.Atom<A>) => B
} = dual(
  (args) => typeof args[0] !== 'function',
  <A>(atom: Atom.Atom<A>, f?: (_: A) => A): A => {
    const registry = useRegistry()
    if (f !== undefined) {
      const atomB = React.useMemo(() => Atom.map(atom, f), [atom, f])
      return useStore(registry, atomB)
    }
    return useStore(registry, atom)
  },
)

function mountAtom<A>(registry: Atom.Registry.Registry, atom: Atom.Atom<A>): void {
  React.useEffect(() => Atom.Registry.subscribe(registry, atom, constVoid, { immediate: true }), [atom, registry])
}

/**
 * Mounts an atom in the current React registry for the lifetime of the
 * component.
 *
 * **When to use**
 *
 * Use to keep an atom mounted from a React component without reading, writing,
 * or refreshing it.
 *
 * **Details**
 *
 * The hook uses the current `RegistryContext` and releases the mount through
 * React effect cleanup when the component unmounts or when the registry or atom
 * dependency changes.
 *
 * @see {@link useAtomSet} for mounting a writable atom while returning a setter
 * @see {@link useAtomRefresh} for mounting an atom while returning a refresh callback
 *
 * @since 4.0.0
 */
export const useAtomMount = <A>(atom: Atom.Atom<A>): void => {
  const registry = useRegistry()
  mountAtom(registry, atom)
}

/**
 * Mounts a writable atom and returns a setter without subscribing to its value.
 *
 * **When to use**
 *
 * Use when a React component needs to update a writable atom without rendering
 * from that atom's value.
 *
 * The hook mounts the atom and returns a setter that writes a complete value.
 * For updates computed from the current value use `useAtomUpdate`.
 *
 * @see {@link useAtom} for reading and updating the same writable atom
 * @see {@link useAtomSetResult} for a setter that resolves once the write settles
 * @see {@link useAtomUpdate} for a setter that applies an updater function
 *
 * @since 4.0.0
 */
export const useAtomSet = <R, W>(atom: Atom.Writable<R, W>): (value: W) => void => {
  const registry = useRegistry()
  mountAtom(registry, atom)
  return React.useCallback((value: W) => {
    Atom.Registry.set(registry, atom, value)
  }, [registry, atom])
}

/**
 * Mounts a writable `AsyncResult` atom and returns a setter whose returned
 * effect resolves to the settled success value.
 *
 * **When to use**
 *
 * Use when a component writes to an `AsyncResult` atom and needs to know when
 * the write has been applied, so a save button can show a confirming state or
 * report a failure.
 *
 * The hook mounts the atom and returns a setter that writes a new value and
 * returns the effect of the atom leaving its initial state, failing with the
 * write result's cause when the write fails.
 *
 * @see {@link useAtomSet} for writing without waiting for settlement
 *
 * @since 4.0.0
 */
export const useAtomSetResult = <A, E, W>(
  atom: Atom.Writable<Atom.AsyncResult.Result<A, E>, W>,
): (value: W) => Effect.Effect<A, E> => {
  const registry = useRegistry()
  mountAtom(registry, atom)
  return React.useCallback((value: W) => {
    Atom.Registry.set(registry, atom, value)
    return Atom.Registry.getResult(registry, atom, { suspendOnWaiting: true })
  }, [registry, atom])
}

/**
 * Mounts a writable atom and returns an updater that applies a function to the
 * current value.
 *
 * **When to use**
 *
 * Use when a component needs to update a writable atom from its current value,
 * such as incrementing a counter, without subscribing to the atom.
 *
 * @see {@link useAtomSet} for writing a complete value
 *
 * @since 4.0.0
 */
export const useAtomUpdate = <R, W>(atom: Atom.Writable<R, W>): (f: (previous: R) => W) => void => {
  const registry = useRegistry()
  mountAtom(registry, atom)
  return React.useCallback((f: (previous: R) => W) => {
    Atom.Registry.update(registry, atom, f)
  }, [registry, atom])
}

/**
 * Mounts an atom and returns a callback that refreshes it in the current React
 * registry.
 *
 * **When to use**
 *
 * Use to expose a React callback that requests a refresh for an atom without
 * reading or writing its value.
 *
 * **Details**
 *
 * The hook uses the current `RegistryContext`, mounts the atom for the
 * component lifetime, and returns a callback that calls `registry.refresh`.
 *
 * @see {@link useAtomMount} for mounting an atom without returning a refresh callback
 *
 * @since 4.0.0
 */
export const useAtomRefresh = <A>(atom: Atom.Atom<A>): () => void => {
  const registry = useRegistry()
  mountAtom(registry, atom)
  return React.useCallback(() => {
    Atom.Registry.refresh(registry, atom)
  }, [registry, atom])
}

/**
 * Subscribes to a writable atom and returns its current value together with a
 * setter for updating it.
 *
 * **When to use**
 *
 * Use when a React component needs both to render the current value of a
 * writable atom and update it from the same component.
 *
 * @see {@link useAtomValue} for subscribing to an atom without a setter
 * @see {@link useAtomSet} for updating a writable atom without subscribing to its value
 *
 * @since 4.0.0
 */
export const useAtom = <R, W>(
  atom: Atom.Writable<R, W>,
): readonly [value: R, write: (value: W) => void] => {
  const registry = useRegistry()
  return [
    useStore(registry, atom),
    React.useCallback((value: W) => Atom.Registry.set(registry, atom, value), [registry, atom]),
  ]
}

/**
 * Subscribes a callback to an atom in the current React registry for the
 * component lifetime.
 *
 * **When to use**
 *
 * Use when a React component needs to run a callback for atom changes without
 * reading the atom value during render.
 *
 * **Details**
 *
 * The subscription is installed in a React effect and cleaned up on unmount or
 * dependency change. When `options.immediate` is enabled, the callback receives
 * the current value when the effect subscribes.
 *
 * @see {@link useAtomValue} for reading an atom value during render instead of running a callback
 *
 * @since 4.0.0
 */
export const useAtomSubscribe: {
  <A>(
    f: (_: A) => void,
    options?: { readonly immediate?: boolean },
  ): (atom: Atom.Atom<A>) => void
  <A>(
    atom: Atom.Atom<A>,
    f: (_: A) => void,
    options?: { readonly immediate?: boolean },
  ): void
} = dual(
  (args) => typeof args[0] !== 'function',
  <A>(
    atom: Atom.Atom<A>,
    f: (_: A) => void,
    options?: { readonly immediate?: boolean },
  ): void => {
    const registry = useRegistry()
    const fRef = React.useRef(f)
    fRef.current = f
    React.useEffect(
      () => Atom.Registry.subscribe(registry, atom, (value) => fRef.current(value), options),
      [registry, atom, options?.immediate],
    )
  },
)
