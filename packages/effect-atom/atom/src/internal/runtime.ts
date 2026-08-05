/**
 * @since 1.0.0
 */
import * as Cause from 'effect/Cause'
import { NoSuchElementException } from 'effect/Cause'
import type * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Exit from 'effect/Exit'
import * as FiberId from 'effect/FiberId'
import * as Option from 'effect/Option'
import { isTagged } from 'effect/Predicate'
import * as Runtime from 'effect/Runtime'
import { SyncScheduler } from 'effect/Scheduler'

// Concrete (non-Effect) union of terminal values an Effect can carry.
// Effect unifies with these via the typeSymbol, but TS can't see that
// without an explicit cast; the single cast below lands on a concrete type.
type TaggedValue<A, E> =
  | Exit.Exit<A, E>
  | Either.Either<A, E>
  | Option.Option<A>

const fastPath = <R, E, A>(effect: Effect.Effect<A, E, R>): Exit.Exit<A, E> | undefined => {
  const op = effect as TaggedValue<A, E>
  if (isTagged('Success')(op) || isTagged('Failure')(op)) {
    return op as Exit.Exit<A, E>
  }
  if (isTagged('Left')(op)) {
    return Exit.fail((op as Either.Left<E, A>).left)
  }
  if (isTagged('Right')(op)) {
    return Exit.succeed((op as Either.Right<E, A>).right)
  }
  if (isTagged('Some')(op)) {
    return Exit.succeed((op as Option.Some<A>).value)
  }
  if (isTagged('None')(op)) {
    const cause = Cause.fail(new NoSuchElementException()) as Cause.Cause<E>
    return Exit.failCause(cause)
  }
  return undefined
}

/** @internal */
export const runCallbackSync = <R, ER = never>(runtime: Runtime.Runtime<R>) => {
  const runFork = Runtime.runFork(runtime)
  return <A, E>(
    effect: Effect.Effect<A, E, R>,
    onExit: (exit: Exit.Exit<A, E | ER>) => void,
    uninterruptible = false,
  ): (() => void) | undefined => {
    const op = fastPath(effect)
    if (op) {
      onExit(op)
      return undefined
    }
    const scheduler = new SyncScheduler()
    const fiberRuntime = runFork(effect, { scheduler })
    scheduler.flush()
    const result = fiberRuntime.unsafePoll()
    if (result) {
      onExit(result)
      return undefined
    }
    fiberRuntime.addObserver(onExit)
    function cancel() {
      fiberRuntime.removeObserver(onExit)
      if (!uninterruptible) {
        fiberRuntime.unsafeInterruptAsFork(FiberId.none)
      }
    }
    return cancel
  }
}
