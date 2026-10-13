/**
 * React context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through React context lets components in the same
 * subtree read and write the same atom state.
 *
 * @since 4.0.0
 */
'use client'

import type { Atom } from '@systemfsoftware/effect-atom'
import { createContext, createElement, type ReactNode, useContext } from 'react'
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
 * Props accepted by {@link RegistryProvider}.
 *
 * @since 4.0.0
 */
export type RegistryProviderOptions = {
  readonly registry: Atom.Registry.Registry
  readonly children?: ReactNode | undefined
}

/**
 * Provides the `Registry` its owner created to a React subtree.
 *
 * **When to use**
 *
 * Use at the root of an app, island or story, with the registry the code that
 * mounts it created before the first render.
 *
 * **Details**
 *
 * The provider creates, seeds, hydrates and disposes nothing. The owner calls
 * `Atom.Registry.make` (passing `scheduleTask: AtomReact.scheduleTask` and any
 * `initialValues`), hydrates saved state with `Atom.Hydration.hydrate` before
 * rendering, and calls `Atom.Registry.dispose` at teardown, or composes the
 * registry with `Atom.Registry.layer`, which disposes it when its scope closes.
 *
 * **Gotchas**
 *
 * React keeps no state for a render that suspended before its first mount, so a
 * registry created during render is rebuilt on every retry and never disposed.
 * Create it outside render.
 *
 * @see {@link RegistryContext} for the React context supplied by this provider
 * @see {@link scheduleTask} for the scheduler the owner passes to the registry
 *
 * @since 4.0.0
 */
export const RegistryProvider = (options: RegistryProviderOptions) =>
  createElement(RegistryContext.Provider, { value: options.registry }, options.children)
