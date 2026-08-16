/**
 * Run-safe — fail-open containment for handler bodies.
 *
 * Runs the thunk to completion, reports the fault through the injected
 * logger callback, and returns `undefined` (no modification, no block)
 * instead of letting the throw escape into the host runner. A handler fault
 * must be observable but must never block or poison a tool call.
 *
 * Note the deliberate divergence from `omp-agent-discipline`'s runSafe,
 * which rethrows the squashed Effect cause on failure: this plugin has no
 * Effect runtime layer, so the combinator returns `undefined` on any fault
 * and the handler's `logFault` is the only observability. The sibling's
 * kernel/policy split exists for its lazy runtime import; a single module
 * suffices here.
 */

export type RunSafe = <A>(
  run: () => Promise<A>,
  onError: (error: unknown) => void,
) => Promise<A | undefined>

export const runSafe: RunSafe = async (run, onError) => {
  try {
    return await run()
  } catch (error) {
    onError(error)
    return undefined
  }
}
