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
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { constVoid, dual } from 'effect/Function'
import * as React from 'react'
import { RegistryContext } from './RegistryContext.js'

function useStore<A>(registry: Registry.Registry, atom: Atom.Atom<A>): A {
  const subscribe = React.useMemo(
    () => (onStoreChange: () => void) => Registry.subscribe(registry, atom, () => onStoreChange()),
    [registry, atom],
  )
  return React.useSyncExternalStore(
    subscribe,
    () => Registry.get(registry, atom),
    () => Atom.getServerValue(atom, registry),
  )
}

type AnyAtom<Val = unknown> = Atom.Atom<Val>
type AnyInitialValue<Val = unknown> = readonly [AnyAtom<Val>, Val]
type AnyPromiseMap<Val = unknown> = WeakMap<AnyAtom<Val>, Promise<void>>
type AnyValue<Val = unknown> = Val

const initialValuesSet = new WeakMap<Registry.Registry, WeakSet<AnyAtom>>()

function initialValuesSetFor(
  registry: Registry.Registry,
): WeakSet<AnyAtom> {
  const existing = initialValuesSet.get(registry)
  if (existing !== undefined) {
    return existing
  }
  return createInitialValuesSet(registry)
}

function createInitialValuesSet(
  registry: Registry.Registry,
): WeakSet<AnyAtom> {
  const set = new WeakSet<AnyAtom>()
  initialValuesSet.set(registry, set)
  return set
}

function seedInitialValueIfNew(
  set: WeakSet<AnyAtom>,
  registry: Registry.Registry,
  atom: AnyAtom,
  value: AnyValue,
): void {
  if (set.has(atom)) {
    return
  }
  set.add(atom)
  Registry.setInitialValue(registry, atom, value)
}

function seedInitialValues(
  registry: Registry.Registry,
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
  seedInitialValues(React.useContext(RegistryContext), initialValues)
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
 * @since 4.0.0
 */
export const useAtomValue: {
  <A>(atom: Atom.Atom<A>): A
  <A, B>(atom: Atom.Atom<A>, f: (_: A) => B): B
  <A, B>(f: (_: A) => B): (atom: Atom.Atom<A>) => B
} = dual(
  (args) => typeof args[0] !== 'function',
  <A>(atom: Atom.Atom<A>, f?: (_: A) => A): A => {
    const registry = React.useContext(RegistryContext)
    if (f !== undefined) {
      const atomB = React.useMemo(() => Atom.map(atom, f), [atom, f])
      return useStore(registry, atomB)
    }
    return useStore(registry, atom)
  },
)

function mountAtom<A>(registry: Registry.Registry, atom: Atom.Atom<A>): void {
  React.useEffect(() => Registry.subscribe(registry, atom, constVoid, { immediate: true }), [atom, registry])
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
 * @since 4.0.0
 */
export const useAtomSet = <R, W>(atom: Atom.Writable<R, W>): (value: W) => void => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback((value: W) => {
    Registry.set(registry, atom, value)
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
  atom: Atom.Writable<AsyncResult.Result<A, E>, W>,
): (value: W) => Effect.Effect<A, E> => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback((value: W) => {
    Registry.set(registry, atom, value)
    return Registry.getResult(registry, atom, { suspendOnWaiting: true })
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
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback((f: (previous: R) => W) => {
    Registry.update(registry, atom, f)
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
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback(() => {
    Registry.refresh(registry, atom)
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
  const registry = React.useContext(RegistryContext)
  return [
    useStore(registry, atom),
    React.useCallback((value: W) => Registry.set(registry, atom, value), [registry, atom]),
  ]
}

const atomPromiseMap = {
  suspendOnWaiting: new WeakMap<
    Registry.Registry,
    AnyPromiseMap
  >(),
  default: new WeakMap<
    Registry.Registry,
    AnyPromiseMap
  >(),
}

function booleanOrFalse(value: boolean | undefined): boolean {
  if (value === undefined) {
    return false
  }
  return value
}

function suspendOnWaitingFrom(options?: {
  readonly suspendOnWaiting?: boolean | undefined
}): boolean {
  if (options === undefined) {
    return false
  }
  return booleanOrFalse(options.suspendOnWaiting)
}

function includeFailureFrom(options?: {
  readonly includeFailure?: boolean | undefined
}): boolean {
  if (options === undefined) {
    return false
  }
  return booleanOrFalse(options.includeFailure)
}

function promiseRegistries(
  suspendOnWaiting: boolean,
): WeakMap<Registry.Registry, AnyPromiseMap> {
  if (suspendOnWaiting) {
    return atomPromiseMap.suspendOnWaiting
  }
  return atomPromiseMap.default
}

function createAtomPromiseMap(
  registries: WeakMap<Registry.Registry, AnyPromiseMap>,
  registry: Registry.Registry,
): AnyPromiseMap {
  const map = new WeakMap<AnyAtom, Promise<void>>()
  registries.set(registry, map)
  return map
}

function promiseMapFor(
  registry: Registry.Registry,
  suspendOnWaiting: boolean,
): AnyPromiseMap {
  const registries = promiseRegistries(suspendOnWaiting)
  const existing = registries.get(registry)
  if (existing !== undefined) {
    return existing
  }
  return createAtomPromiseMap(registries, registry)
}

function waitingBlocks<A, E>(
  result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>,
  suspendOnWaiting: boolean,
): boolean {
  if (suspendOnWaiting === false) {
    return false
  }
  return result.waiting
}

function resultIsPending<A, E>(
  result: AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
): boolean {
  if (AsyncResult.isInitial(result)) {
    return true
  }
  return waitingBlocks(result, suspendOnWaiting)
}

function shouldKeepPending<A, E>(
  settled: boolean,
  result: AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
): boolean {
  if (settled) {
    return true
  }
  return resultIsPending(result, suspendOnWaiting)
}

function settleAtomPromise(
  state: { settled: boolean },
  dispose: () => void,
  resolve: () => void,
  map: AnyPromiseMap,
  atom: AnyAtom,
): void {
  state.settled = true
  dispose()
  resolve()
  map.delete(atom)
}

function onAtomPromiseResult<A, E>(
  state: { settled: boolean },
  result: AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
  dispose: () => void,
  resolve: () => void,
  map: AnyPromiseMap,
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
): void {
  if (shouldKeepPending(state.settled, result, suspendOnWaiting)) {
    return
  }
  settleAtomPromise(state, dispose, resolve, map, atom)
}

function createAtomPromise<A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
  map: AnyPromiseMap,
): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  const state = { settled: false }
  const dispose = Registry.subscribe(registry, atom, (result) => {
    onAtomPromiseResult(state, result, suspendOnWaiting, dispose, resolve, map, atom)
  })
  map.set(atom, promise)
  return promise
}

function atomToPromise<A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
): Promise<void> {
  const map = promiseMapFor(registry, suspendOnWaiting)
  const cached = map.get(atom)
  if (cached !== undefined) {
    return cached
  }
  return createAtomPromise(registry, atom, suspendOnWaiting, map)
}

function isReadyResult<A, E>(
  value: AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
): value is AsyncResult.Success<A, E> | AsyncResult.Failure<A, E> {
  if (AsyncResult.isInitial(value)) {
    return false
  }
  return waitingBlocks(value, suspendOnWaiting) === false
}

function throwForSuspense(error: Error): never {
  throw error
}

function atomResultOrSuspend<A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
): AsyncResult.Success<A, E> | AsyncResult.Failure<A, E> {
  const value = useStore(registry, atom)
  if (isReadyResult(value, suspendOnWaiting)) {
    return value
  }
  // @ts-expect-error React Suspense requires throwing a thenable promise.
  throwForSuspense(atomToPromise(registry, atom, suspendOnWaiting))
}

function failureResultOrThrow<A, E>(
  result: AsyncResult.Failure<A, E>,
  options?: {
    readonly includeFailure?: boolean | undefined
  },
): AsyncResult.Failure<A, E> {
  if (includeFailureFrom(options)) {
    return result
  }
  throw Cause.squash(result.cause)
}

function resolveAtomSuspense<A, E>(
  result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>,
  options?: {
    readonly includeFailure?: boolean | undefined
  },
): AsyncResult.Success<A, E> | AsyncResult.Failure<A, E> {
  if (AsyncResult.isFailure(result)) {
    return failureResultOrThrow(result, options)
  }
  return result
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
 * @since 4.0.0
 */
export const useAtomSuspense: {
  <A, E>(
    options?: {
      readonly suspendOnWaiting?: boolean | undefined
      readonly includeFailure?: boolean | undefined
    },
  ): (atom: Atom.Atom<AsyncResult.Result<A, E>>) => AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
  <A, E>(
    atom: Atom.Atom<AsyncResult.Result<A, E>>,
    options?: {
      readonly suspendOnWaiting?: boolean | undefined
      readonly includeFailure?: boolean | undefined
    },
  ): AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
} = dual(
  (args) => Atom.isAtom(args[0]),
  <A, E>(
    atom: Atom.Atom<AsyncResult.Result<A, E>>,
    options?: {
      readonly suspendOnWaiting?: boolean | undefined
      readonly includeFailure?: boolean | undefined
    },
  ): AsyncResult.Success<A, E> | AsyncResult.Failure<A, E> => {
    const registry = React.useContext(RegistryContext)
    return resolveAtomSuspense(
      atomResultOrSuspend(registry, atom, suspendOnWaitingFrom(options)),
      options,
    )
  },
)

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
    const registry = React.useContext(RegistryContext)
    const fRef = React.useRef(f)
    fRef.current = f
    React.useEffect(
      () => Registry.subscribe(registry, atom, (value) => fRef.current(value), options),
      [registry, atom, options?.immediate],
    )
  },
)

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
 * @since 4.0.0
 */
export const useAtomRefProp: {
  <A, K extends keyof A>(prop: K): (ref: AtomRef.AtomRef<A>) => AtomRef.AtomRef<A[K]>
  <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): AtomRef.AtomRef<A[K]>
} = dual(
  2,
  <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): AtomRef.AtomRef<A[K]> =>
    React.useMemo(() => ref.prop(prop), [ref, prop]),
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
 * through `ref.subscribe`.
 *
 * @see {@link useAtomRefProp} for returning the property ref directly
 * @see {@link useAtomRef} for subscribing to a whole atom ref value
 *
 * @since 4.0.0
 */
export const useAtomRefPropValue: {
  <A, K extends keyof A>(prop: K): (ref: AtomRef.AtomRef<A>) => A[K]
  <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): A[K]
} = dual(
  2,
  <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): A[K] => useAtomRef(useAtomRefProp(ref, prop)),
)
