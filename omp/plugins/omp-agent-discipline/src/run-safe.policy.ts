/**
 * Policy cell — domain-blind combinator governing shell-edge execution:
 * run `Effect<A, E, R>` through the shared runtime to completion, throw the
 * squashed cause on failure (a rejected handler = allow in the runner),
 * return the same `A` on success. The runtime module stays lazy so the
 * platform-node layer never evaluates at plugin-registration time.
 */

import type { Effect } from 'effect'
import type runtime from './runtime.kernel.js'

type R = Effect.Effect.Context<Parameters<typeof runtime.runPromise>[0]>

export const runSafe = async <A, E>(effect: Effect.Effect<A, E, R>): Promise<A> => {
  const [runtime, Cause, Effect, Exit] = await Promise.all(
    [
      import('./runtime.kernel.js').then((mod) => mod.default),
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
