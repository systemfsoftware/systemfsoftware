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
import * as Runtime from 'effect/Runtime'
import { SyncScheduler } from 'effect/Scheduler'

// Concrete (non-Effect) terminal values an Effect can carry: a completed
// effect is an Exit, and Effect unifies with Either and Option values too.
// The predicates below re-express that unification without assertions.

const isExitValue = <A, E>(value: unknown): value is Exit.Exit<A, E> => Exit.isExit(value)

const fastPath = <R, E, A>(effect: Effect.Effect<A, E, R>): Exit.Exit<A, E> | undefined => {
  const op: unknown = effect
  if (isExitValue<A, E>(op)) {
    return op
  }
  if (Either.isEither(op)) {
    return Either.match(op, {
      onLeft: (left) => Exit.fail(left as E),
      onRight: (right) => Exit.succeed(right as A),
    })
  }
  if (Option.isOption(op)) {
    return Option.match(op, {
      onNone: () => Exit.failCause(Cause.fail(new NoSuchElementException()) as Cause.Cause<E>),
      onSome: (value) => Exit.succeed(value as A),
    })
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
