/**
 * Policy cell — domain-blind combinator governing shell-edge execution:
 * run `Effect<A, E, R>` through the shared runtime to completion, throw the
 * squashed cause on failure (a rejected handler = allow in the runner),
 * return the same `A` on success. The runtime module stays lazy so the
 * platform-node layer never evaluates at plugin-registration time.
 */

import type { Effect } from 'effect'
import type { RunSafe, RuntimeContext } from './RunSafe.js'

export const runSafe: RunSafe = async <A, E>(effect: Effect.Effect<A, E, RuntimeContext>): Promise<A> => {
  const [runtime, Cause, Effect, Exit] = await Promise.all(
    [
      import('./Runtime.js').then((mod) => mod.default),
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
