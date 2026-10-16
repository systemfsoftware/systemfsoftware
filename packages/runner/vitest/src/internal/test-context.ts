import * as Context from 'effect/Context'
import type * as V from 'vitest'

/** @internal */
export const vitestTestContextKey = '@systemfsoftware/vitest/TestContext'

/**
 * The running Vitest test, or `null` outside a run; provided on every test the fork runs.
 *
 * @internal
 */
export const VitestTestContext: Context.Reference<V.TestContext | null> = Context.Reference(
  vitestTestContextKey,
  { defaultValue: (): V.TestContext | null => null },
)
