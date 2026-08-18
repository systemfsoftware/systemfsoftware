/**
 * React hooks for working with Effect atoms from components. The hooks read,
 * write, mount, refresh, and subscribe to atoms from `RegistryContext`, handle
 * `AsyncResult` atoms with React Suspense, and expose helpers for reading and
 * deriving `AtomRef` values.
 *
 * @since 4.0.0
 */
'use client'

import * as Atom from '@systemfsoftware/effect-atom/Atom'
import type * as AtomRef from '@systemfsoftware/effect-atom/AtomRef'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { RegistryContext } from './RegistryContext.js'

function useStore<A>(registry: AtomRegistry.Registry, atom: Atom.Atom<A>): A {
  const subscribe = React.useMemo(
    () => (onStoreChange: () => void) => registry.subscribe(atom, () => onStoreChange()),
    [registry, atom],
  )
  return React.useSyncExternalStore(subscribe, () => registry.get(atom), () => Atom.getServerValue(atom, registry))
}

const initialValuesSet = new WeakMap<AtomRegistry.Registry, WeakSet<Atom.Atom<unknown>>>()

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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomInitialValues = (initialValues: Iterable<readonly [Atom.Atom<unknown>, unknown]>): void => {
  const registry = React.useContext(RegistryContext)
  let set = initialValuesSet.get(registry)
  if (set === undefined) {
    set = new WeakSet()
    initialValuesSet.set(registry, set)
  }
  for (const [atom, value] of initialValues) {
    if (!set.has(atom)) {
      set.add(atom)
      registry.setInitialValue(atom, value)
    }
  }
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
 * @see {@link useAtomRef} for reading an `AtomRef` directly
 *
 * @category hooks
 * @since 4.0.0
 */
export const useAtomValue: {
  <A>(atom: Atom.Atom<A>): A
  <A, B>(atom: Atom.Atom<A>, f: (_: A) => B): B
} = <A>(atom: Atom.Atom<A>, f?: (_: A) => A): A => {
  const registry = React.useContext(RegistryContext)
  if (f) {
    const atomB = React.useMemo(() => Atom.map(atom, f), [atom, f])
    return useStore(registry, atomB)
  }
  return useStore(registry, atom)
}

function mountAtom<A>(registry: AtomRegistry.Registry, atom: Atom.Atom<A>): void {
  React.useEffect(() => registry.mount(atom), [atom, registry])
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomMount = <A>(atom: Atom.Atom<A>): void => {
  const registry = React.useContext(RegistryContext)
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomSet = <R, W>(atom: Atom.Writable<R, W>): (value: W) => void => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback((value: W) => {
    registry.set(atom, value)
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomSetResult = <A, E, W>(
  atom: Atom.Writable<AsyncResult.Result<A, E>, W>,
): (value: W) => Effect.Effect<A, E> => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback((value: W) => {
    registry.set(atom, value)
    return AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomUpdate = <R, W>(atom: Atom.Writable<R, W>): (f: (previous: R) => W) => void => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback((f: (previous: R) => W) => {
    registry.update(atom, f)
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomRefresh = <A>(atom: Atom.Atom<A>): () => void => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback(() => {
    registry.refresh(atom)
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtom = <R, W>(
  atom: Atom.Writable<R, W>,
): readonly [value: R, write: (value: W) => void] => {
  const registry = React.useContext(RegistryContext)
  return [
    useStore(registry, atom),
    React.useCallback((value: W) => registry.set(atom, value), [registry, atom]),
  ]
}

const atomPromiseMap = {
  suspendOnWaiting: new WeakMap<
    AtomRegistry.Registry,
    WeakMap<Atom.Atom<unknown>, Promise<void>>
  >(),
  default: new WeakMap<
    AtomRegistry.Registry,
    WeakMap<Atom.Atom<unknown>, Promise<void>>
  >(),
}

function atomToPromise<A, E>(
  registry: AtomRegistry.Registry,
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
): Promise<void> {
  const registries = suspendOnWaiting ? atomPromiseMap.suspendOnWaiting : atomPromiseMap.default
  let map = registries.get(registry)
  if (map === undefined) {
    map = new WeakMap()
    registries.set(registry, map)
  }
  const cached = map.get(atom)
  if (cached !== undefined) {
    return cached
  }
  const { promise, resolve } = Promise.withResolvers<void>()
  let settled = false
  const dispose = registry.subscribe(atom, (result) => {
    if (settled || AsyncResult.isInitial(result) || (suspendOnWaiting && result.waiting)) {
      return
    }
    settled = true
    dispose()
    resolve()
    map.delete(atom)
  })
  map.set(atom, promise)
  return promise
}

function atomResultOrSuspend<A, E>(
  registry: AtomRegistry.Registry,
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
): AsyncResult.Success<A, E> | AsyncResult.Failure<A, E> {
  const value = useStore(registry, atom)
  if (AsyncResult.isInitial(value) || (suspendOnWaiting && value.waiting)) {
    throw atomToPromise(registry, atom, suspendOnWaiting)
  }
  return value
}

/**
 * Reads an `AsyncResult` atom through React Suspense, suspending while the
 * result is initial or configured as waiting.
 *
 * **When to use**
 *
 * Use when a React component should render only after an `AsyncResult` atom has
 * left its initial state, with loading delegated to a Suspense boundary.
 *
 * **Details**
 *
 * `suspendOnWaiting` defaults to `false`. When `includeFailure` is `true`, a
 * failure result is returned instead of being thrown.
 *
 * **Gotchas**
 *
 * Without `includeFailure`, failure results are thrown with
 * `Cause.squash(result.cause)`, so callers need an error boundary for failures.
 *
 * @see {@link useAtomValue} for reading the raw `AsyncResult` value without Suspense
 *
 * @category hooks
 * @since 4.0.0
 */
export const useAtomSuspense = <A, E>(
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
  options?: {
    readonly suspendOnWaiting?: boolean | undefined
    readonly includeFailure?: boolean | undefined
  },
): AsyncResult.Success<A, E> | AsyncResult.Failure<A, E> => {
  const registry = React.useContext(RegistryContext)
  const result = atomResultOrSuspend(registry, atom, options?.suspendOnWaiting ?? false)
  if (AsyncResult.isFailure(result)) {
    if (options?.includeFailure) {
      return result
    }
    throw Cause.squash(result.cause)
  }
  return result
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
 * @category hooks
 * @since 4.0.0
 */
export const useAtomSubscribe = <A>(
  atom: Atom.Atom<A>,
  f: (_: A) => void,
  options?: { readonly immediate?: boolean },
): void => {
  const registry = React.useContext(RegistryContext)
  const fRef = React.useRef(f)
  fRef.current = f
  React.useEffect(
    () => registry.subscribe(atom, (value) => fRef.current(value), options),
    [registry, atom, options?.immediate],
  )
}

/**
 * Subscribes to an atom ref and returns its latest value.
 *
 * **When to use**
 *
 * Use when a React component should render from an `AtomRef.ReadonlyRef`
 * directly instead of reading an atom through the current registry.
 *
 * **Details**
 *
 * The hook subscribes with `ref.subscribe`, triggers re-renders through React
 * state, and returns the current `ref.value`.
 *
 * @see {@link useAtomValue} for reading an `Atom` from the current registry
 * @see {@link useAtomRefPropValue} for reading a property ref value
 *
 * @category hooks
 * @since 4.0.0
 */
export const useAtomRef = <A>(ref: AtomRef.ReadonlyRef<A>): A => {
  const [, setValue] = React.useState(ref.value)
  React.useEffect(() => ref.subscribe(setValue), [ref])
  return ref.value
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
 * The hook memoizes `ref.prop(prop)` for the `[ref, prop]` dependency pair and
 * returns the property ref so callers can read, set, update, or subscribe to
 * that nested property.
 *
 * @see {@link useAtomRef} for subscribing to an atom ref value
 * @see {@link useAtomRefPropValue} for subscribing directly to a property value
 *
 * @category hooks
 * @since 4.0.0
 */
export const useAtomRefProp = <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): AtomRef.AtomRef<A[K]> =>
  React.useMemo(() => ref.prop(prop), [ref, prop])

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
 * through `ref.subscribe`.
 *
 * @see {@link useAtomRefProp} for returning the property ref directly
 * @see {@link useAtomRef} for subscribing to a whole atom ref value
 *
 * @category hooks
 * @since 4.0.0
 */
export const useAtomRefPropValue = <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): A[K] =>
  useAtomRef(useAtomRefProp(ref, prop))
