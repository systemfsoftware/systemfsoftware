import * as Context from 'effect/Context'
import * as Fiber from 'effect/Fiber'
import * as Function from 'effect/Function'
import type * as V from 'vitest'

/** @internal */
export interface Running {
  readonly ctx: V.TestContext
  /** The second run: checks throw there and a failure is reported as leaked state. */
  readonly shadow: boolean
}

/**
 * The run a test's fibers execute in. Effect code reads it through
 * `Fiber.getCurrent`, so no node-only store is needed (KTD4).
 *
 * @internal
 */
export const Running = Context.Reference<Running | undefined>('effect-vitest/binding', {
  defaultValue: () => undefined,
})

/** @internal */
export const currentRun = (): Running | undefined => Fiber.getCurrent()?.getRef(Running)

/*
 * A synchronous body runs with a module-level slot set to its task for exactly
 * the duration of the synchronous call. No other test can interleave inside one
 * synchronous call, so this is exact for bodies that never await (KTD4).
 */
let syncRun: Running | undefined = undefined

/** @internal */
export const withSyncRun: {
  <A>(body: () => A): (run: Running) => A
  <A>(run: Running, body: () => A): A
} = Function.dual(2, <A>(run: Running, body: () => A): A => {
  const previous = syncRun
  syncRun = run
  try {
    return body()
  } finally {
    syncRun = previous
  }
})

/**
 * The run the current execution belongs to: the fiber's binding first, then the
 * synchronous slot for code that runs outside a fiber.
 *
 * @internal
 */
export const lookupRun = (): Running | undefined => currentRun() ?? syncRun

const NO_ERRORS: ReadonlyArray<object> = []

/** @internal */
export const errorCount = (ctx: V.TestContext): number => presentErrors(ctx.task.result?.errors).length

const presentErrors = (errors: ReadonlyArray<object> | undefined): ReadonlyArray<object> =>
  errors === undefined ? NO_ERRORS : errors
