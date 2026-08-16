/**
 * Run-safe policy — fail-open containment for handler bodies.
 *
 * Runs the thunk to completion, reports the fault through the injected
 * logger callback, and returns `undefined` (no modification, no block)
 * instead of letting the throw escape into the host runner. A handler
 * fault must be observable but must never block or poison a tool call.
 */

import type { RunSafe } from './run-safe.kernel.js'

export const runSafe: RunSafe = async (run, onError) => {
  try {
    return await run()
  } catch (error) {
    onError(error)
    return undefined
  }
}
