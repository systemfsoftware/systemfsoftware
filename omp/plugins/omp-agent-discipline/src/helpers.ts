import type { Effect } from 'effect'
import type runtime from './runtime.js'

type R = Effect.Effect.Context<Parameters<typeof runtime.runPromise>[0]>

export const runSafe = async <A, E>(effect: Effect.Effect<A, E, R>): Promise<A> => {
  const [runtime, Cause, Effect, Exit] = await Promise.all(
    [
      import('./runtime.js').then((mod) => mod.default),
      import('effect/Cause'),
      import('effect/Effect'),
      import('effect/Exit'),
    ],
  )

  const exited = effect.pipe(Effect.exit)
  const exit = await runtime.runPromise(exited)
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
  return exit.value
}
