/**
 * React hook that reads an `AsyncResult` atom through React Suspense.
 *
 * @since 4.0.0
 */
'use client'

import { Atom } from '@systemfsoftware/effect-atom'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import { dual } from 'effect/Function'
import * as React from 'react'
import { useAtomValue } from './hooks-value.js'
import { useRegistry } from './registry-context.js'

type AnyAtom<Val = unknown> = Atom.Atom<Val>
type AnyPromiseMap<Val = unknown> = WeakMap<AnyAtom<Val>, Promise<void>>

type AtomPromiseMaps = {
  readonly suspendOnWaiting: AnyPromiseMap
  readonly default: AnyPromiseMap
}

class AtomPromiseMapsKey extends Context.Service<AtomPromiseMapsKey, AtomPromiseMaps>()(
  '@systemfsoftware/effect-atom-react/hooks-suspense/AtomPromiseMapsKey',
) {}

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

function promiseMapFor(
  registry: Atom.Registry.Registry,
  suspendOnWaiting: boolean,
): AnyPromiseMap {
  const maps = Atom.Registry.storage(registry, AtomPromiseMapsKey, () => ({
    suspendOnWaiting: new WeakMap<AnyAtom, Promise<void>>(),
    default: new WeakMap<AnyAtom, Promise<void>>(),
  }))
  return suspendOnWaiting ? maps.suspendOnWaiting : maps.default
}

function waitingBlocks<A, E>(
  result: Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E>,
  suspendOnWaiting: boolean,
): boolean {
  if (suspendOnWaiting === false) {
    return false
  }
  return result.waiting
}

function resultIsPending<A, E>(
  result: Atom.AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
): boolean {
  if (Atom.AsyncResult.isInitial(result)) {
    return true
  }
  return waitingBlocks(result, suspendOnWaiting)
}

function shouldKeepPending<A, E>(
  settled: boolean,
  result: Atom.AsyncResult.Result<A, E>,
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
  result: Atom.AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
  dispose: () => void,
  resolve: () => void,
  map: AnyPromiseMap,
  atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
): void {
  if (shouldKeepPending(state.settled, result, suspendOnWaiting)) {
    return
  }
  settleAtomPromise(state, dispose, resolve, map, atom)
}

function createAtomPromise<A, E>(
  registry: Atom.Registry.Registry,
  atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
  map: AnyPromiseMap,
): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  const state = { settled: false }
  const dispose = Atom.Registry.subscribe(registry, atom, (result) => {
    onAtomPromiseResult(state, result, suspendOnWaiting, dispose, resolve, map, atom)
  })
  map.set(atom, promise)
  return promise
}

function atomToPromise<A, E>(
  registry: Atom.Registry.Registry,
  atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
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
  value: Atom.AsyncResult.Result<A, E>,
  suspendOnWaiting: boolean,
): value is Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E> {
  if (Atom.AsyncResult.isInitial(value)) {
    return false
  }
  return waitingBlocks(value, suspendOnWaiting) === false
}

function atomResultOrSuspend<A, E>(
  registry: Atom.Registry.Registry,
  atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
): Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E> {
  const value = useAtomValue(atom)
  if (isReadyResult(value, suspendOnWaiting)) {
    return value
  }
  return suspendUntilReady(registry, atom, suspendOnWaiting)
}

function suspendUntilReady<A, E>(
  registry: Atom.Registry.Registry,
  atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
  suspendOnWaiting: boolean,
): Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E> {
  React.use(atomToPromise(registry, atom, suspendOnWaiting))
  const current = Atom.Registry.get(registry, atom)
  if (isReadyResult(current, suspendOnWaiting)) {
    return current
  }
  return suspendUntilReady(registry, atom, suspendOnWaiting)
}

function failureResultOrThrow<A, E>(
  result: Atom.AsyncResult.Failure<A, E>,
  options?: {
    readonly includeFailure?: boolean | undefined
  },
): Atom.AsyncResult.Failure<A, E> {
  if (includeFailureFrom(options)) {
    return result
  }
  throw Cause.squash(result.cause)
}

function resolveAtomSuspense<A, E>(
  result: Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E>,
  options?: {
    readonly includeFailure?: boolean | undefined
  },
): Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E> {
  if (Atom.AsyncResult.isFailure(result)) {
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
  ): (atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>) => Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E>
  <A, E>(
    atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
    options?: {
      readonly suspendOnWaiting?: boolean | undefined
      readonly includeFailure?: boolean | undefined
    },
  ): Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E>
} = dual(
  (args) => Atom.isAtom(args[0]),
  <A, E>(
    atom: Atom.Atom<Atom.AsyncResult.Result<A, E>>,
    options?: {
      readonly suspendOnWaiting?: boolean | undefined
      readonly includeFailure?: boolean | undefined
    },
  ): Atom.AsyncResult.Success<A, E> | Atom.AsyncResult.Failure<A, E> => {
    const registry = useRegistry()
    return resolveAtomSuspense(
      atomResultOrSuspend(registry, atom, suspendOnWaitingFrom(options)),
      options,
    )
  },
)
