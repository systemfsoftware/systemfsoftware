/**
 * runSafe — fail-open containment for handler bodies.
 *
 * Runs the thunk to completion, reports the fault through the injected
 * logger callback, and returns `undefined` (no modification, no block)
 * instead of letting the throw escape into the host runner. A handler fault
 * must be observable but must never block or poison a tool call.
 *
 * Deliberate divergence from `omp-agent-discipline`'s runSafe, which rethrows
 * the squashed Effect cause on failure: this plugin has no Effect runtime
 * layer, so the combinator returns `undefined` on any fault and the handler's
 * `logFault` is the only observability.
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

export const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown failure'
}
