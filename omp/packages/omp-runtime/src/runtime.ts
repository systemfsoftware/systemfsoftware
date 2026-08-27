import { Cause, Effect, Exit, Layer, ManagedRuntime } from 'effect'

export type RunSafe<R = unknown> = <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>

export const bootstrapPluginRuntime = <R>(layer: Layer.Layer<R, unknown, never>) => {
  const runtime = ManagedRuntime.make(layer)

  const dispose = (): void => {
    void runtime.dispose()
  }
  process.once('SIGINT', dispose)
  process.once('SIGTERM', dispose)

  const runSafe: RunSafe<R> = <A, E>(effect: Effect.Effect<A, E, R>): Promise<A> =>
    runtime.runPromise(Effect.exit(effect)).then((exit) => {
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
      return exit.value
    })

  return { runtime, runSafe } as const
}

/**
 * A runSafe for registration time: the runtime module is imported only at
 * event time or after session_start, never inside the factory (PLG4). ESM
 * caches the module, so warm and runSafe share one instance however often the
 * host re-imports the entry.
 */
export const lazyRunSafe = <R>(
  loadRuntime: () => Promise<{ readonly runSafe: RunSafe<R> }>,
): RunSafe<R> =>
(effect) => loadRuntime().then((mod) => mod.runSafe(effect))
