/**
 * @since 1.0.0
 */
'use client'
import type * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Effect from 'effect/Effect'
import * as FiberId from 'effect/FiberId'
import * as Runtime from 'effect/Runtime'
import * as React from 'react'
import * as Scheduler from 'scheduler'

/**
 * @since 1.0.0
 * @category context
 */
export function scheduleTask(f: () => void): void {
  Scheduler.unstable_scheduleCallback(Scheduler.unstable_LowPriority, f)
}

/**
 * @since 1.0.0
 * @category context
 */
export const RegistryContext = React.createContext<Registry.Registry>(Registry.make({
  scheduleTask,
  defaultIdleTTL: 400,
}))

/**
 * @since 1.0.0
 * @category context
 */
export const RegistryProvider = (options: {
  readonly children?: React.ReactNode | undefined
  readonly initialValues?: Iterable<readonly [Atom.Atom<any>, any]> | undefined
  readonly scheduleTask?: ((f: () => void) => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
}) => {
  const ref = React.useRef<{
    readonly registry: Registry.Registry
    timeout?: (() => void) | undefined
  }>(null)
  if (ref.current === null) {
    ref.current = {
      registry: Registry.make({
        scheduleTask: options.scheduleTask ?? scheduleTask,
        initialValues: options.initialValues,
        timeoutResolution: options.timeoutResolution,
        defaultIdleTTL: options.defaultIdleTTL,
      }),
    }
  }
  React.useEffect(() => {
    const current = ref.current
    if (current === null) return
    current.timeout?.()
    return () => {
      const fiber = Runtime.runFork(Runtime.defaultRuntime)(
        Effect.sleep(500).pipe(
          Effect.andThen(() => {
            current.registry.dispose()
            ref.current = null
          }),
        ),
      )
      current.timeout = () => fiber.unsafeInterruptAsFork(FiberId.none)
    }
  }, [ref])
  return React.createElement(RegistryContext.Provider, { value: ref.current.registry }, options?.children)
}
