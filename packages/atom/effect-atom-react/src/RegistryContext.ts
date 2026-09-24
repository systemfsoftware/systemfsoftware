/**
 * React context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through React context lets components in the same
 * subtree read and write the same atom state.
 *
 * @since 4.0.0
 */
'use client'

import type * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as React from 'react'
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
 * hydration helpers, defaulting to a standalone registry when no provider is
 * present.
 *
 * **When to use**
 *
 * Use to supply an existing `Registry` through React context when hooks or
 * hydration helpers need to share registry state that is managed outside
 * `RegistryProvider`.
 *
 * @see {@link RegistryProvider} for creating and providing a registry for a React subtree
 *
 * @since 4.0.0
 */
export const RegistryContext = React.createContext<Registry.Registry>(Registry.make({
  scheduleTask,
  defaultIdleTTL: 400,
}))

type AnyAtom<Val = unknown> = Atom.Atom<Val>
type AnyInitialValue<Val = unknown> = readonly [AnyAtom<Val>, Val]

type RegistryProviderOptions = {
  readonly children?: React.ReactNode | undefined
  readonly initialValues?: Iterable<AnyInitialValue> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
}

type RegistryRef = {
  readonly registry: Registry.Registry
  cancelDispose?: (() => void) | undefined
}

function scheduleTaskFrom(options: RegistryProviderOptions): (f: () => void) => () => void {
  if (options.scheduleTask === undefined) {
    return scheduleTask
  }
  return options.scheduleTask
}

function createRegistryState(options: RegistryProviderOptions): RegistryRef {
  return {
    registry: Registry.make({
      scheduleTask: scheduleTaskFrom(options),
      initialValues: options.initialValues,
      timeoutResolution: options.timeoutResolution,
      defaultIdleTTL: options.defaultIdleTTL,
    }),
  }
}

function cancelDisposeTimerIfSet(current: RegistryRef): void {
  if (current.cancelDispose === undefined) {
    return
  }
  current.cancelDispose()
  current.cancelDispose = undefined
}

function cancelPendingDispose(current: RegistryRef | null): void {
  if (current === null) {
    return
  }
  cancelDisposeTimerIfSet(current)
}

function disposeRegistryRef(ref: React.RefObject<RegistryRef | null>): void {
  const current = ref.current
  if (current === null) {
    return
  }
  Registry.dispose(current.registry)
  ref.current = null
}

function assignDisposeTimer(ref: React.RefObject<RegistryRef | null>): void {
  const current = ref.current
  if (current === null) {
    return
  }
  // The dispose is deferred so a remount - StrictMode's double invoke, or fast
  // refresh - reclaims the same registry instead of losing it. The delay runs
  // on the registry's configured `scheduleTimer`, so the remount cancels the
  // scheduled dispose instead of reaching for the platform timer globals.
  current.cancelDispose = Registry.scheduleTimer(current.registry, () => {
    disposeRegistryRef(ref)
  }, 500)
}

function scheduleDelayedDispose(ref: React.RefObject<RegistryRef | null>): void {
  if (ref.current === null) {
    return
  }
  assignDisposeTimer(ref)
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
 * The provider creates one `Registry` with `Registry.make`, passes it
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
  const ref = React.useRef<RegistryRef | null>(null)
  if (ref.current === null) {
    ref.current = createRegistryState(options)
  }
  React.useEffect(() => {
    cancelPendingDispose(ref.current)
    return () => {
      scheduleDelayedDispose(ref)
    }
  }, [ref])
  return React.createElement(RegistryContext.Provider, { value: ref.current.registry }, options.children)
}
