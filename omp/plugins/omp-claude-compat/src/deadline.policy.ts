import { Duration, Effect, Fiber, Option, Scope } from 'effect'
import type { LazyArg } from 'effect/Function'

/**
 * Run `self` detached in `scope`, giving up on the result after `deadline`
 * without giving up on the work.
 *
 * `Effect.timeout` interrupts what it wraps, so timing out the work itself
 * cancels it. Here the deadline wraps only the join, and the fibre belongs to
 * `scope` rather than the caller - observing a fibre does not own it. The
 * caller stops waiting; the work runs on until `scope` closes, which is the
 * one thing that interrupts it and runs its finalisers.
 */
export const detachIn = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  scope: Scope.Scope,
  options: {
    readonly deadline: Duration.Input
    readonly onDeadline: LazyArg<A>
  },
): Effect.Effect<A, E, R> =>
  Effect.forkIn(self, scope).pipe(
    Effect.flatMap((fiber) => Fiber.join(fiber)),
    Effect.timeoutOption(options.deadline),
    Effect.map((result) => Option.getOrElse(result, options.onDeadline)),
  )
