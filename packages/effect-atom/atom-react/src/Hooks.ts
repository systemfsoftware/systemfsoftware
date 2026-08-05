/**
 * @since 1.0.0
 */
/// <reference lib="es2024.promise" />
'use client'

import * as Atom from '@systemfsoftware/effect-atom/Atom'
import type * as AtomRef from '@systemfsoftware/effect-atom/AtomRef'
import { getResult, type Registry } from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import { Effect } from 'effect'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import { globalValue } from 'effect/GlobalValue'
import * as React from 'react'
import { RegistryContext } from './RegistryContext.js'

interface AtomStore<A> {
  readonly subscribe: (f: () => void) => () => void
  readonly snapshot: () => A
  readonly getServerSnapshot: () => A
}

const storeRegistry = globalValue(
  '@systemfsoftware/effect-atom-react/storeRegistry',
  () => new WeakMap<Registry, WeakMap<Atom.Atom<any>, AtomStore<any>>>(),
)

function makeStore<A>(registry: Registry, atom: Atom.Atom<A>): AtomStore<A> {
  let stores = storeRegistry.get(registry)
  if (stores === undefined) {
    stores = new WeakMap()
    storeRegistry.set(registry, stores)
  }
  const store = stores.get(atom)
  if (store !== undefined) {
    return store
  }
  const newStore: AtomStore<A> = {
    subscribe(f) {
      return registry.subscribe(atom, f)
    },
    snapshot() {
      return registry.get(atom)
    },
    getServerSnapshot() {
      return Atom.getServerValue(atom, registry)
    },
  }
  stores.set(atom, newStore)
  return newStore
}

function useStore<A>(registry: Registry, atom: Atom.Atom<A>): A {
  const store = makeStore(registry, atom)

  return React.useSyncExternalStore(store.subscribe, store.snapshot, store.getServerSnapshot)
}

const initialValuesSet = globalValue(
  '@systemfsoftware/effect-atom-react/initialValuesSet',
  () => new WeakMap<Registry, WeakSet<Atom.Atom<any>>>(),
)

interface InitialValueNode<A> {
  readonly setValue: (value: A) => void
}

interface InitialValueRegistry extends Registry {
  readonly ensureNode: <A>(atom: Atom.Atom<A>) => InitialValueNode<A>
}

const hasInitialValueAccess = (registry: Registry): registry is InitialValueRegistry =>
  'ensureNode' in registry && typeof registry.ensureNode === 'function'

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomInitialValues = (initialValues: Iterable<readonly [Atom.Atom<any>, any]>): void => {
  const registry = React.useContext(RegistryContext)
  if (!hasInitialValueAccess(registry)) {
    throw new Error('Atom registry does not support initial values')
  }
  let set = initialValuesSet.get(registry)
  if (set === undefined) {
    set = new WeakSet()
    initialValuesSet.set(registry, set)
  }
  for (const [atom, value] of initialValues) {
    if (!set.has(atom)) {
      set.add(atom)
      registry.ensureNode(atom).setValue(value)
    }
  }
}

/**
 * @since 1.0.0
 * @category hooks
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

function mountAtom<A>(registry: Registry, atom: Atom.Atom<A>): void {
  React.useEffect(() => registry.mount(atom), [atom, registry])
}

const isUpdater = <R, W>(value: W | ((value: R) => W)): value is (value: R) => W => typeof value === 'function'

const isResultAtom = <R, W>(
  registry: Registry,
  atom: Atom.Writable<R, W>,
): atom is Atom.Writable<R, W> & Atom.Atom<Result.Result<unknown, unknown>> => Result.isResult(registry.get(atom))

function setAtom<R, W, Mode extends 'value' | 'promise' | 'promiseExit' = never>(
  registry: Registry,
  atom: Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [Result.Result<any, any>] ? Mode : 'value') | undefined
  },
): 'promise' extends Mode ? (
    (value: W) => Promise<Result.Result.Success<R>>
  )
  : 'promiseExit' extends Mode ? (
      (value: W) => Promise<Exit.Exit<Result.Result.Success<R>, Result.Result.Failure<R>>>
    )
  : ((value: W | ((value: R) => W)) => void)

function setAtom<R, W>(
  registry: Registry,
  atom: Atom.Writable<R, W>,
  options?: { readonly mode?: 'value' | 'promise' | 'promiseExit' | undefined },
): unknown {
  if (options?.mode === 'promise' || options?.mode === 'promiseExit') {
    return React.useCallback((value: W) => {
      registry.set(atom, value)
      if (!isResultAtom(registry, atom)) {
        throw new Error('Promise mode requires an atom Result value')
      }
      const promise = Effect.runPromiseExit(
        getResult(registry, atom, { suspendOnWaiting: true }),
      )
      return options.mode === 'promise' ? promise.then(flattenExit) : promise
    }, [registry, atom, options.mode])
  }
  return React.useCallback((value: W | ((value: R) => W)) => {
    registry.set(atom, isUpdater(value) ? value(registry.get(atom)) : value)
  }, [registry, atom])
}

const flattenExit = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomMount = <A>(atom: Atom.Atom<A>): void => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomSet = <
  R,
  W,
  Mode extends 'value' | 'promise' | 'promiseExit' = never,
>(
  atom: Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [Result.Result<any, any>] ? Mode : 'value') | undefined
  },
): 'promise' extends Mode ? (
    (value: W) => Promise<Result.Result.Success<R>>
  )
  : 'promiseExit' extends Mode ? (
      (value: W) => Promise<Exit.Exit<Result.Result.Success<R>, Result.Result.Failure<R>>>
    )
  : ((value: W | ((value: R) => W)) => void) =>
{
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return setAtom(registry, atom, options)
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomRefresh = <A>(atom: Atom.Atom<A>): () => void => {
  const registry = React.useContext(RegistryContext)
  mountAtom(registry, atom)
  return React.useCallback(() => {
    registry.refresh(atom)
  }, [registry, atom])
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtom = <R, W, const Mode extends 'value' | 'promise' | 'promiseExit' = never>(
  atom: Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [Result.Result<any, any>] ? Mode : 'value') | undefined
  },
): readonly [
  value: R,
  write: 'promise' extends Mode ? (
      (value: W) => Promise<Result.Result.Success<R>>
    )
    : 'promiseExit' extends Mode ? (
        (value: W) => Promise<Exit.Exit<Result.Result.Success<R>, Result.Result.Failure<R>>>
      )
    : ((value: W | ((value: R) => W)) => void),
] => {
  const registry = React.useContext(RegistryContext)
  return [
    useStore(registry, atom),
    setAtom(registry, atom, options),
  ] as const
}

const atomPromiseMap = globalValue(
  '@systemfsoftware/effect-atom-react/atomPromiseMap',
  () => ({
    suspendOnWaiting: new Map<Atom.Atom<any>, Promise<void>>(),
    default: new Map<Atom.Atom<any>, Promise<void>>(),
  }),
)

function atomToPromise<A, E>(
  registry: Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
  suspendOnWaiting: boolean,
) {
  const map = suspendOnWaiting ? atomPromiseMap.suspendOnWaiting : atomPromiseMap.default
  const existingPromise = map.get(atom)
  if (existingPromise !== undefined) {
    return existingPromise
  }
  const { promise, resolve } = Promise.withResolvers<void>()
  registry.subscribe(atom, (result) => {
    if (Result.isInitial(result) || (suspendOnWaiting && result.waiting)) {
      return
    }
    resolve()
    map.delete(atom)
  })
  map.set(atom, promise)
  return promise
}

function atomResultOrSuspend<A, E>(
  registry: Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
  suspendOnWaiting: boolean,
) {
  const value = useStore(registry, atom)
  if (Result.isInitial(value) || (suspendOnWaiting && value.waiting)) {
    throw atomToPromise(registry, atom, suspendOnWaiting)
  }
  return value
}

/**
 * @since 1.0.0
 * @category hooks
 */
export function useAtomSuspense<A, E>(
  atom: Atom.Atom<Result.Result<A, E>>,
  options?: {
    readonly suspendOnWaiting?: boolean | undefined
    readonly includeFailure?: false | undefined
  },
): Result.Success<A, E>
export function useAtomSuspense<A, E>(
  atom: Atom.Atom<Result.Result<A, E>>,
  options: {
    readonly suspendOnWaiting?: boolean | undefined
    readonly includeFailure: true
  },
): Result.Success<A, E> | Result.Failure<A, E>
export function useAtomSuspense<A, E>(
  atom: Atom.Atom<Result.Result<A, E>>,
  options?: {
    readonly suspendOnWaiting?: boolean | undefined
    readonly includeFailure?: boolean | undefined
  },
): Result.Success<A, E> | Result.Failure<A, E> {
  const registry = React.useContext(RegistryContext)
  const result = atomResultOrSuspend(registry, atom, options?.suspendOnWaiting ?? false)
  if (Result.isFailure(result)) {
    if (options?.includeFailure === true) {
      return result
    }
    throw Cause.squash(result.cause)
  }
  return result
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomSubscribe = <A>(
  atom: Atom.Atom<A>,
  f: (_: A) => void,
  options?: { readonly immediate?: boolean },
): void => {
  const registry = React.useContext(RegistryContext)
  React.useEffect(
    () => registry.subscribe(atom, f, options),
    [registry, atom, f, options],
  )
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomRef = <A>(ref: AtomRef.ReadonlyRef<A>): A => {
  const [, setValue] = React.useState(ref.value)
  React.useEffect(() => ref.subscribe(setValue), [ref])
  return ref.value
}

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomRefProp = <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): AtomRef.AtomRef<A[K]> =>
  React.useMemo(() => ref.prop(prop), [ref, prop])

/**
 * @since 1.0.0
 * @category hooks
 */
export const useAtomRefPropValue = <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): A[K] =>
  useAtomRef(useAtomRefProp(ref, prop))
