/**
 * Run-safe kernel — declares the containment combinator used by every
 * `pi.on` handler in this plugin.
 *
 * The containment semantics are the same as `omp-agent-discipline`'s run-safe
 * pair (a handler fault must log and no-op rather than poison the tool call),
 * narrowed to this plugin's zero-runtime world: there is no Effect layer to
 * execute, so the combinator guards a plain promise-producing thunk.
 */

export type RunSafe = <A>(
  run: () => Promise<A>,
  onError: (error: unknown) => void,
) => Promise<A | undefined>
