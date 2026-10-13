/**
 * React context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through React context lets components in the same
 * subtree read and write the same atom state.
 *
 * @since 4.0.0
 */
'use client'

import { Atom } from '@systemfsoftware/effect-atom'
import { createContext, createElement, type ReactNode, useContext, useState, useSyncExternalStore } from 'react'
import * as Scheduler from 'scheduler'

/**
 * Schedules Atom registry work with React's scheduler at low priority and
 * returns a cancellation function for the scheduled task.
 *
 * @since 4.0.0
 */
export function scheduleTask(f: () => void): () => void {
  const node = Scheduler.unstable_scheduleCallback(Scheduler.unstable_LowPriority, f)
  return () => Scheduler.unstable_cancelCallback(node)
}

/**
 * Provides a React context that supplies the `Registry` used by Atom hooks and
 * hydration helpers. The context has no default, so reading it outside a
 * provider yields nothing for {@link useRegistry} to return.
 *
 * **When to use**
 *
 * Use to supply an existing `Registry` through React context when hooks or
 * hydration helpers need to share registry state that is managed outside
 * `RegistryProvider`.
 *
 * @see {@link RegistryProvider} for creating and providing a registry for a React subtree
 * @see {@link useRegistry} for reading the registry supplied to the nearest provider
 *
 * @since 4.0.0
 */
export const RegistryContext = createContext<Atom.Registry.Registry | undefined>(undefined)

/**
 * Returns the `Registry` supplied by the nearest provider of
 * {@link RegistryContext}.
 *
 * **When to use**
 *
 * Use inside a hook or component that needs the current registry and can
 * require a provider to exist.
 *
 * **Gotchas**
 *
 * Throws when no registry is in context. Wrap the component tree in a
 * {@link RegistryProvider} to supply one.
 *
 * @see {@link RegistryContext} for supplying the registry directly
 *
 * @since 4.0.0
 */
export function useRegistry(): Atom.Registry.Registry {
  const registry = useContext(RegistryContext)
  if (registry === undefined) {
    throw new Error('No registry found in context: wrap the component tree in a RegistryProvider.')
  }
  return registry
}

export type AnyAtom<Val = unknown> = Atom.Atom<Val>

export type AnyInitialValue<Val = unknown> = readonly [AnyAtom<Val>, Val]

/**
 * Options accepted by {@link RegistryProvider}.
 *
 * @since 4.0.0
 */
export type RegistryProviderOptions = {
  readonly children?: ReactNode | undefined
  readonly initialValues?: Iterable<AnyInitialValue> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
}

type RegistryLease = {
  readonly current: () => Atom.Registry.Registry
  readonly subscribe: (onStoreChange: () => void) => () => void
}

function scheduleTaskFrom(options: RegistryProviderOptions): (f: () => void) => () => void {
  if (options.scheduleTask === undefined) {
    return scheduleTask
  }
  return options.scheduleTask
}

function makeRegistry(options: RegistryProviderOptions): Atom.Registry.Registry {
  return Atom.Registry.make({
    scheduleTask: scheduleTaskFrom(options),
    initialValues: options.initialValues,
    timeoutResolution: options.timeoutResolution,
    defaultIdleTTL: options.defaultIdleTTL,
  })
}

function makeRegistryLease(options: RegistryProviderOptions): RegistryLease {
  let registry: Atom.Registry.Registry | undefined
  let cancelDispose: (() => void) | undefined
  const current = (): Atom.Registry.Registry => {
    if (registry === undefined) {
      registry = makeRegistry(options)
    }
    return registry
  }
  const cancelPendingDispose = (): void => {
    if (cancelDispose === undefined) {
      return
    }
    cancelDispose()
    cancelDispose = undefined
  }
  const dispose = (held: Atom.Registry.Registry): void => {
    cancelDispose = undefined
    Atom.Registry.dispose(held)
    registry = undefined
  }
  const subscribe = (): () => void => {
    cancelPendingDispose()
    const held = current()
    return () => {
      cancelDispose = Atom.Registry.scheduleTimer(held, () => dispose(held), 500)
    }
  }
  return { current, subscribe }
}

/**
 * Provides a stable `Registry` to a React subtree, optionally seeding
 * initial atom values and overriding registry scheduling or idle settings.
 *
 * **When to use**
 *
 * Use to scope atom state, scheduling, and idle cleanup to a React subtree.
 *
 * **Details**
 *
 * The provider creates one `Registry` with `Atom.Registry.make`, passes it
 * through `RegistryContext.Provider`, and forwards `initialValues`,
 * `scheduleTask`, `timeoutResolution`, and `defaultIdleTTL` only when that
 * registry is created.
 *
 * **Gotchas**
 *
 * Option changes after the first render do not rebuild the registry. When the
 * provider unmounts, registry disposal is delayed briefly and canceled if the
 * provider remounts before the timeout fires.
 *
 * @see {@link RegistryContext} for the React context supplied by this provider
 *
 * @since 4.0.0
 */
export const RegistryProvider = (options: RegistryProviderOptions) => {
  const [lease] = useState(() => makeRegistryLease(options))
  const registry = useSyncExternalStore(lease.subscribe, lease.current, lease.current)
  return createElement(RegistryContext.Provider, { value: registry }, options.children)
}
