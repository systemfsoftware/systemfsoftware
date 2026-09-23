/**
 * Represents observable state for asynchronous values.
 *
 * `Result<A, E>` records whether asynchronous work has no value yet,
 * succeeded with an `A`, or failed with an `E`. Every state also carries a
 * `waiting` flag, so callers can keep showing the current value while newer
 * work is loading, refreshing, retrying, or recovering. This module includes
 * constructors, checks, accessors, mapping and matching helpers, ways to combine
 * several results, and schemas for encoding or decoding results.
 *
 * @since 4.0.0
 */
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import type { LazyArg } from 'effect/Function'
import { constTrue, dual } from 'effect/Function'
import * as Option from 'effect/Option'
import type { Pipeable } from 'effect/Pipeable'
import * as PipeableModule from 'effect/Pipeable'
import type { Predicate, Refinement } from 'effect/Predicate'
import { isIterable, isTagged } from 'effect/Predicate'
import * as Either from 'effect/Result'
import type * as Types from 'effect/Types'

import {
  type Failure,
  failure,
  type Initial,
  initial,
  isResult,
  type Result,
  type Success,
  success,
  successWith,
  TypeId,
} from './ResultValues.js'

/**
 * Re-export the value-side declarations from the shared value module so the
 * public `Result` namespace keeps its surface. The module exists to
 * break the import cycle between `Result.ts` and `internal/result-schema.ts`;
 * see `result-values.ts` for the declarations themselves.
 *
 * The `Result` type re-export below carries the merged namespace declared in
 * `result-values.ts` (`Result.Proto`, `Result.Success<R>`, `Result.Failure<R>`);
 * re-exporting the symbol is what keeps those members public.
 */
export {
  failure,
  initial,
  isResult,
  // alias: upstream names this guard `isAsyncResult`
  isResult as isAsyncResult,
  success,
  successWith,
  TypeId,
}
export type { Failure, Initial, Result, Success } from './ResultValues.js'

type AnyResult<A = unknown, E = unknown> = Result<A, E>
type AnySuccess<A = unknown, E = unknown> = Success<A, E>
type Top<A = unknown> = A

/**
 * Rebuilds an `Result` with new success and failure types while preserving the variant of another result.
 *
 * @since 4.0.0
 */
export type With<R extends AnyResult, A, E> = R extends Initial<infer _A, infer _E> ? Initial<A, E>
  : R extends Success<infer _A, infer _E> ? Success<A, E>
  : R extends Failure<infer _A, infer _E> ? Failure<A, E>
  : never

/**
 * Returns whether an `Result` is currently waiting for an asynchronous computation or refresh to finish.
 *
 * @since 4.0.0
 */
export const isWaiting = <A, E>(result: Result<A, E>): boolean => result.waiting

/**
 * Converts an `Exit` into a `Success` when it succeeds or a `Failure` carrying the exit cause when it fails.
 *
 * @since 4.0.0
 */
export const fromExit = <A, E>(exit: Exit.Exit<A, E>): Success<A, E> | Failure<A, E> => {
  if (Exit.isSuccess(exit)) {
    return success(exit.value)
  }
  return failure(exit.cause)
}

/**
 * Converts an `Exit` to a result, preserving the latest previous success when the exit is a failure.
 *
 * @since 4.0.0
 */
export const fromExitWithPrevious: {
  <A, E>(previous: Option.Option<Result<A, E>>): (exit: Exit.Exit<A, E>) => Success<A, E> | Failure<A, E>
  <A, E>(exit: Exit.Exit<A, E>, previous: Option.Option<Result<A, E>>): Success<A, E> | Failure<A, E>
} = dual(
  2,
  <A, E>(
    exit: Exit.Exit<A, E>,
    previous: Option.Option<Result<A, E>>,
  ): Success<A, E> | Failure<A, E> => {
    if (Exit.isSuccess(exit)) {
      return success(exit.value)
    }
    return failureWithPrevious(exit.cause, { previous })
  },
)

/**
 * Creates a waiting result from an optional previous result, using `Initial(true)` when no previous result exists.
 *
 * @since 4.0.0
 */
export const waitingFrom = <A, E>(previous: Option.Option<Result<A, E>>): Result<A, E> => {
  if (Option.isNone(previous)) {
    return initial(true)
  }
  return waiting(previous.value)
}

/**
 * Returns `true` when an `Result` is in the `Initial` state.
 *
 * @since 4.0.0
 */
export const isInitial = <A, E>(result: Result<A, E>): result is Initial<A, E> => isTagged(result, 'Initial')

/**
 * Returns `true` when an `Result` is either `Success` or `Failure`.
 *
 * @since 4.0.0
 */
export const isNotInitial = <A, E>(result: Result<A, E>): result is Success<A, E> | Failure<A, E> => !isInitial(result)

/**
 * Returns `true` when an `Result` is a `Success`.
 *
 * @since 4.0.0
 */
export const isSuccess = <A, E>(result: Result<A, E>): result is Success<A, E> => isTagged(result, 'Success')

/**
 * Returns `true` when an `Result` is a `Failure`.
 *
 * @since 4.0.0
 */
export const isFailure = <A, E>(result: Result<A, E>): result is Failure<A, E> => isTagged(result, 'Failure')

/**
 * Returns `true` when an `Result` is a `Failure` whose cause contains only interruptions.
 *
 * @since 4.0.0
 */
export const isInterrupted = <A, E>(result: Result<A, E>): result is Failure<A, E> =>
  isFailure(result) && Cause.hasInterruptsOnly(result.cause)

const previousSuccessFromNonSuccess = <A, E>(result: Initial<A, E> | Failure<A, E>): Option.Option<Success<A, E>> => {
  if (isFailure(result)) {
    return result.previousSuccess
  }
  return Option.none()
}

const previousSuccessFromResult = <A, E>(result: Result<A, E>): Option.Option<Success<A, E>> => {
  if (isSuccess(result)) {
    return Option.some(result)
  }
  return previousSuccessFromNonSuccess(result)
}

/**
 * Creates a `Failure` result from a `Cause`, carrying forward the latest success stored in a previous result.
 *
 * @since 4.0.0
 */
export const failureWithPrevious: {
  <A, E>(options: {
    readonly previous: Option.Option<Result<A, E>>
    readonly waiting?: boolean | undefined
  }): (cause: Cause.Cause<E>) => Failure<A, E>
  <A, E>(
    cause: Cause.Cause<E>,
    options: {
      readonly previous: Option.Option<Result<A, E>>
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E>
} = dual(
  2,
  <A, E>(
    cause: Cause.Cause<E>,
    options: {
      readonly previous: Option.Option<Result<A, E>>
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E> =>
    failure(cause, {
      previousSuccess: Option.flatMap(options.previous, previousSuccessFromResult),
      waiting: options.waiting,
    }),
)

/**
 * Creates a `Failure` result from a typed error, wrapping it in `Cause.fail`.
 *
 * To carry forward a previous success or mark the result as waiting, use
 * `failWith`.
 *
 * @since 4.0.0
 */
export const fail = <E, A = never>(error: E): Failure<A, E> => failWith(error, {})

/**
 * Can also be called data-last inside `pipe`: `failWith(options)(error)`.
 *
 * @since 4.0.0
 */
export const failWith: {
  <A, E>(options: {
    readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
    readonly waiting?: boolean | undefined
  }): (error: E) => Failure<A, E>
  <A, E>(
    error: E,
    options: {
      readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E>
} = dual(
  2,
  <A, E>(
    error: E,
    options: {
      readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E> => failure(Cause.fail(error), options),
)

/**
 * Creates a `Failure` result from a typed error while carrying forward the latest success stored in a previous result.
 *
 * @since 4.0.0
 */
export const failWithPrevious: {
  <A, E>(options: {
    readonly previous: Option.Option<Result<A, E>>
    readonly waiting?: boolean | undefined
  }): (error: E) => Failure<A, E>
  <A, E>(
    error: E,
    options: {
      readonly previous: Option.Option<Result<A, E>>
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E>
} = dual(
  2,
  <A, E>(
    error: E,
    options: {
      readonly previous: Option.Option<Result<A, E>>
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E> => failureWithPrevious(Cause.fail(error), options),
)

type TouchOptions = {
  readonly touch?: boolean | undefined
}

const maybeTouchDefined = <R extends AnyResult>(self: R, options: TouchOptions): R => {
  if (options.touch === true) {
    return touch(self)
  }
  return self
}

const maybeTouch = <R extends AnyResult>(self: R, options: TouchOptions | undefined): R => {
  if (options === undefined) {
    return self
  }
  return maybeTouchDefined(self, options)
}

/**
 * Marks an `Result` as waiting, optionally touching the timestamp when the result is a `Success`.
 *
 * @since 4.0.0
 */
export const waiting: {
  <R extends AnyResult>(options?: {
    readonly touch?: boolean | undefined
  }): (self: R) => R
  <R extends AnyResult>(self: R, options?: {
    readonly touch?: boolean | undefined
  }): R
} = dual(
  (args) => isResult(args[0]),
  <R extends AnyResult>(self: R, options?: {
    readonly touch?: boolean | undefined
  }): R => {
    if (self.waiting) {
      return maybeTouch(self, options)
    }
    return maybeTouch({ ...self, waiting: true }, options)
  },
)

/**
 * Refreshes the timestamp of a `Success` result while preserving its value and waiting flag; non-success results are returned unchanged.
 *
 * @since 4.0.0
 */
export const touch = <A extends AnyResult>(result: A): A => {
  if (isSuccess(result)) {
    return { ...result, timestamp: Effect.runSync(Clock.currentTimeMillis) }
  }
  return result
}

/**
 * Replaces a `Failure` value's stored previous success with the latest success
 * found in another result.
 *
 * @since 4.0.0
 */
export const replacePrevious: {
  <R extends AnyResult, XE, A>(previous: Option.Option<Result<A, XE>>): (self: R) => With<R, A, Result.Failure<R>>
  <R extends AnyResult, XE, A>(
    self: R,
    previous: Option.Option<Result<A, XE>>,
  ): With<R, A, Result.Failure<R>>
} = dual(
  2,
  <A = unknown, E = unknown, XA = unknown>(
    self: Result<A, E>,
    previous: Option.Option<Result<XA, E>>,
  ): AnyResult => {
    if (isFailure(self)) {
      return failureWithPrevious(self.cause, { previous, waiting: self.waiting })
    }
    return self
  },
)

const valueFromNonSuccess = <A, E>(self: Initial<A, E> | Failure<A, E>): Option.Option<A> => {
  if (isFailure(self)) {
    return Option.map(self.previousSuccess, (s) => s.value)
  }
  return Option.none()
}

/**
 * Returns the current success value, or the previous success value stored in a failure, as an `Option`.
 *
 * @since 4.0.0
 */
export const value = <A, E>(self: Result<A, E>): Option.Option<A> => {
  if (isSuccess(self)) {
    return Option.some(self.value)
  }
  return valueFromNonSuccess(self)
}

/**
 * Returns the available value from `value`, or evaluates the fallback when no current or previous success exists.
 *
 * @since 4.0.0
 */
export const getOrElse: {
  <B>(orElse: LazyArg<B>): <A, E>(self: Result<A, E>) => A | B
  <A, E, B>(self: Result<A, E>, orElse: LazyArg<B>): A | B
} = dual(2, <A, E, B>(self: Result<A, E>, orElse: LazyArg<B>): A | B => Option.getOrElse(value(self), orElse))

/**
 * Returns the available value from `value`, or throws `NoSuchElementError` when no current or previous success exists.
 *
 * @since 4.0.0
 */
export const getOrThrow = <A, E>(self: Result<A, E>): A =>
  Option.getOrThrowWith(value(self), () => new Cause.NoSuchElementError('Result.getOrThrow: no value found'))

/**
 * Returns the failure cause when the result is a `Failure`, otherwise `None`.
 *
 * @since 4.0.0
 */
export const cause = <A, E>(self: Result<A, E>): Option.Option<Cause.Cause<E>> => {
  if (isFailure(self)) {
    return Option.some(self.cause)
  }
  return Option.none()
}

/**
 * Returns the first typed error from a failure cause, or `None` for successes, initial results, defects, and interrupt-only causes.
 *
 * @since 4.0.0
 */
export const error = <A, E>(self: Result<A, E>): Option.Option<E> => {
  if (isFailure(self)) {
    return Cause.findErrorOption(self.cause)
  }
  return Option.none()
}

const toExitNonSuccess = <A, E>(self: Initial<A, E> | Failure<A, E>): Exit.Exit<A, E | Cause.NoSuchElementError> => {
  if (isFailure(self)) {
    return Exit.failCause(self.cause)
  }
  return Exit.fail(new Cause.NoSuchElementError())
}

/**
 * Converts a result to an `Exit`, succeeding with a success value, failing with a failure cause, or failing with `NoSuchElementError` for `Initial`.
 *
 * @since 4.0.0
 */
export const toExit: {
  <A, E>(self: Success<A, E> | Failure<A, E>): Exit.Exit<A, E>
  <A, E>(self: Result<A, E>): Exit.Exit<A, E | Cause.NoSuchElementError>
} = <A, E>(
  self: Result<A, E>,
): Exit.Exit<A, E | Cause.NoSuchElementError> => {
  if (isSuccess(self)) {
    return Exit.succeed(self.value)
  }
  return toExitNonSuccess(self)
}

const mapNonSuccess = <E, A, B>(self: Initial<A, E> | Failure<A, E>, f: (a: A) => B): Result<B, E> => {
  if (isFailure(self)) {
    return failure(self.cause, {
      previousSuccess: Option.map(self.previousSuccess, (s) => successWith(f(s.value), s)),
      waiting: self.waiting,
    })
  }
  return initial(self.waiting)
}

/**
 * Maps the success value of an `Result`, also mapping any previous success stored in a failure while leaving initial results unchanged.
 *
 * @since 4.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): <E>(self: Result<A, E>) => Result<B, E>
  <E, A, B>(self: Result<A, E>, f: (a: A) => B): Result<B, E>
} = dual(2, <E, A, B>(self: Result<A, E>, f: (a: A) => B): Result<B, E> => {
  if (isSuccess(self)) {
    return successWith(f(self.value), self)
  }
  return mapNonSuccess(self, f)
})

const successOption = <A, E>(next: Result<A, E>): Option.Option<Success<A, E>> => {
  if (isSuccess(next)) {
    return Option.some(next)
  }
  return Option.none()
}

const flatMapNonSuccess = <E, A, B, E2>(
  self: Initial<A, E> | Failure<A, E>,
  f: (a: A, prev: Success<A, E>) => Result<B, E2>,
): Result<B, E | E2> => {
  if (isFailure(self)) {
    return failure<B, E | E2>(self.cause, {
      previousSuccess: Option.flatMap(self.previousSuccess, (s) => successOption(f(s.value, s))),
      waiting: self.waiting,
    })
  }
  return initial(self.waiting)
}

/**
 * Maps the success value of an `Result` and flattens the result.
 *
 * **When to use**
 *
 * Use to sequence computations that may return another `Result` while
 * preserving initial and failure states.
 *
 * **Details**
 *
 * Initial results are left unchanged. Failures preserve their cause and remap
 * the stored previous success when the mapping function returns a success.
 *
 * @since 4.0.0
 */
export const flatMap: {
  <A, E, B, E2>(
    f: (a: A, prev: Success<A, E>) => Result<B, E2>,
  ): (self: Result<A, E>) => Result<B, E | E2>
  <E, A, B, E2>(self: Result<A, E>, f: (a: A, prev: Success<A, E>) => Result<B, E2>): Result<B, E | E2>
} = dual(
  2,
  <E, A, B, E2>(
    self: Result<A, E>,
    f: (a: A, prev: Success<A, E>) => Result<B, E2>,
  ): Result<B, E | E2> => {
    if (isSuccess(self)) {
      return f(self.value, self)
    }
    return flatMapNonSuccess(self, f)
  },
)

type MatchHandlers<A, E, X, Y, Z> = {
  readonly onInitial: (_: Initial<A, E>) => X
  readonly onFailure: (_: Failure<A, E>) => Y
  readonly onSuccess: (_: Success<A, E>) => Z
}

const matchNonSuccess = <A, E, X, Y, Z>(
  self: Initial<A, E> | Failure<A, E>,
  options: MatchHandlers<A, E, X, Y, Z>,
): X | Y | Z => {
  if (isFailure(self)) {
    return options.onFailure(self)
  }
  return options.onInitial(self)
}

/**
 * Pattern matches an `Result` by calling the handler for `Initial`, `Failure`, or `Success`.
 *
 * @since 4.0.0
 */
export const match: {
  <A, E, X, Y, Z>(options: {
    readonly onInitial: (_: Initial<A, E>) => X
    readonly onFailure: (_: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): (self: Result<A, E>) => X | Y | Z
  <A, E, X, Y, Z>(self: Result<A, E>, options: {
    readonly onInitial: (_: Initial<A, E>) => X
    readonly onFailure: (_: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): X | Y | Z
} = dual(2, <A, E, X, Y, Z>(self: Result<A, E>, options: {
  readonly onInitial: (_: Initial<A, E>) => X
  readonly onFailure: (_: Failure<A, E>) => Y
  readonly onSuccess: (_: Success<A, E>) => Z
}): X | Y | Z => {
  if (isSuccess(self)) {
    return options.onSuccess(self)
  }
  return matchNonSuccess(self, options)
})

type ErrorHandlers<A, E, X, Y> = {
  readonly onError: (error: E, _: Failure<A, E>) => X
  readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
}

const matchFailureErrorOrDefect = <A, E, X, Y>(
  self: Failure<A, E>,
  options: ErrorHandlers<A, E, X, Y>,
): X | Y => {
  const result = Cause.findError(self.cause)
  if (Either.isFailure(result)) {
    return options.onDefect(Cause.squash(result.failure), self)
  }
  return options.onError(result.success, self)
}

type MatchWithErrorHandlers<A, E, W, X, Y, Z> = ErrorHandlers<A, E, X, Y> & {
  readonly onInitial: (_: Initial<A, E>) => W
  readonly onSuccess: (_: Success<A, E>) => Z
}

const matchWithErrorNonSuccess = <A, E, W, X, Y, Z>(
  self: Initial<A, E> | Failure<A, E>,
  options: MatchWithErrorHandlers<A, E, W, X, Y, Z>,
): W | X | Y | Z => {
  if (isFailure(self)) {
    return matchFailureErrorOrDefect(self, options)
  }
  return options.onInitial(self)
}

/**
 * Pattern matches a result, handling successes and initials directly while splitting failures into typed errors or squashed non-error causes passed to `onDefect`.
 *
 * @since 4.0.0
 */
export const matchWithError: {
  <A, E, W, X, Y, Z>(options: {
    readonly onInitial: (_: Initial<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): (self: Result<A, E>) => W | X | Y | Z
  <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
    readonly onInitial: (_: Initial<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): W | X | Y | Z
} = dual(2, <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
  readonly onInitial: (_: Initial<A, E>) => W
  readonly onError: (error: E, _: Failure<A, E>) => X
  readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
  readonly onSuccess: (_: Success<A, E>) => Z
}): W | X | Y | Z => {
  if (isSuccess(self)) {
    return options.onSuccess(self)
  }
  return matchWithErrorNonSuccess(self, options)
})

type MatchWithWaitingHandlers<A, E, W, X, Y, Z> = ErrorHandlers<A, E, X, Y> & {
  readonly onWaiting: (_: Result<A, E>) => W
  readonly onSuccess: (_: Success<A, E>) => Z
}

const matchWithWaitingNonSuccess = <A, E, W, X, Y, Z>(
  self: Initial<A, E> | Failure<A, E>,
  options: MatchWithWaitingHandlers<A, E, W, X, Y, Z>,
): W | X | Y | Z => {
  if (isFailure(self)) {
    return matchFailureErrorOrDefect(self, options)
  }
  return options.onWaiting(self)
}

const matchWithWaitingSettled = <A, E, W, X, Y, Z>(
  self: Result<A, E>,
  options: MatchWithWaitingHandlers<A, E, W, X, Y, Z>,
): W | X | Y | Z => {
  if (isSuccess(self)) {
    return options.onSuccess(self)
  }
  return matchWithWaitingNonSuccess(self, options)
}

/**
 * Pattern matches a result by calling `onWaiting` for waiting or initial states, otherwise handling successes and splitting failures into typed errors or squashed non-error causes.
 *
 * @since 4.0.0
 */
export const matchWithWaiting: {
  <A, E, W, X, Y, Z>(options: {
    readonly onWaiting: (_: Result<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): (self: Result<A, E>) => W | X | Y | Z
  <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
    readonly onWaiting: (_: Result<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): W | X | Y | Z
} = dual(2, <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
  readonly onWaiting: (_: Result<A, E>) => W
  readonly onError: (error: E, _: Failure<A, E>) => X
  readonly onDefect: (defect: Top, _: Failure<A, E>) => Y
  readonly onSuccess: (_: Success<A, E>) => Z
}): W | X | Y | Z => {
  if (self.waiting) {
    return options.onWaiting(self)
  }
  return matchWithWaitingSettled(self, options)
})

/**
 * Combines an iterable or record of `Result` and plain values into one `Result`, returning the first non-success result or a success of the collected values marked waiting when any input success is waiting.
 *
 * @since 4.0.0
 */
type AllSuccess<Arg> = [Arg] extends [readonly Top[]] ? {
    -readonly [K in keyof Arg]: [Arg[K]] extends [Result<infer _A, infer _E>] ? _A : Arg[K]
  }
  : [Arg] extends [Iterable<infer _A>] ? _A extends Result<infer _AA, infer _E> ? _AA : _A
  : [Arg] extends [Record<string, Top>] ? {
      -readonly [K in keyof Arg]: [Arg[K]] extends [Result<infer _A, infer _E>] ? _A : Arg[K]
    }
  : never

type AllError<Arg> = [Arg] extends [readonly Top[]] ? Result.Failure<Arg[number]>
  : [Arg] extends [Iterable<infer _A>] ? Result.Failure<_A>
  : [Arg] extends [Record<string, Top>] ? Result.Failure<Arg[keyof Arg]>
  : never

export function all<const Arg extends Iterable<Top> | Record<string, Top>>(
  results: Arg,
): Result<AllSuccess<Arg>, AllError<Arg>>
export function all<T = unknown>(results: Iterable<T> | Record<string, T>): AnyResult {
  return allImpl(results)
}

type CollectDone = {
  readonly done: true
  readonly result: AnyResult
}

type CollectContinue = {
  readonly done: false
  readonly waiting: boolean
  readonly value: Top
}

type CollectOutcome = CollectDone | CollectContinue

const collectSuccessItem = (result: AnySuccess, waiting: boolean): CollectContinue => {
  if (result.waiting) {
    return { done: false, waiting: true, value: result.value }
  }
  return { done: false, waiting, value: result.value }
}

const collectResultItem = (result: AnyResult, waiting: boolean): CollectOutcome => {
  if (!isSuccess(result)) {
    return { done: true, result }
  }
  return collectSuccessItem(result, waiting)
}

const collectItem = <T = unknown>(result: T, waiting: boolean): CollectOutcome => {
  if (!isResult(result)) {
    return { done: false, waiting, value: result }
  }
  return collectResultItem(result, waiting)
}

type AllArrayState = {
  waiting: boolean
  early: AnyResult | undefined
  successes: Top[]
}

const applyArrayContinue = (state: AllArrayState, outcome: CollectContinue): void => {
  state.waiting = outcome.waiting
  state.successes.push(outcome.value)
}

const applyArrayOutcome = (state: AllArrayState, outcome: CollectOutcome): void => {
  if (outcome.done) {
    state.early = outcome.result
    return
  }
  applyArrayContinue(state, outcome)
}

const collectIntoArray = <T = unknown>(state: AllArrayState, result: T): void => {
  if (state.early !== undefined) {
    return
  }
  applyArrayOutcome(state, collectItem(result, state.waiting))
}

const finishArray = (state: AllArrayState): AnyResult => {
  if (state.early !== undefined) {
    return state.early
  }
  return successWith(state.successes, { waiting: state.waiting })
}

const allIterable = <T = unknown>(results: Iterable<T>): AnyResult => {
  const state: AllArrayState = { waiting: false, early: undefined, successes: [] }
  for (const result of results) {
    collectIntoArray(state, result)
  }
  return finishArray(state)
}

type AllRecordState = {
  waiting: boolean
  early: AnyResult | undefined
  successes: Record<string, Top>
}

const applyRecordContinue = (state: AllRecordState, key: string, outcome: CollectContinue): void => {
  state.waiting = outcome.waiting
  state.successes[key] = outcome.value
}

const applyRecordOutcome = (state: AllRecordState, key: string, outcome: CollectOutcome): void => {
  if (outcome.done) {
    state.early = outcome.result
    return
  }
  applyRecordContinue(state, key, outcome)
}

const collectIntoRecord = <T = unknown>(state: AllRecordState, key: string, result: T): void => {
  if (state.early !== undefined) {
    return
  }
  applyRecordOutcome(state, key, collectItem(result, state.waiting))
}

const finishRecord = (state: AllRecordState): AnyResult => {
  if (state.early !== undefined) {
    return state.early
  }
  return successWith(state.successes, { waiting: state.waiting })
}

const allRecord = <T = unknown>(results: Record<string, T>): AnyResult => {
  const state: AllRecordState = { waiting: false, early: undefined, successes: {} }
  for (const [key, result] of Object.entries(results)) {
    collectIntoRecord(state, key, result)
  }
  return finishRecord(state)
}

const allImpl = <T = unknown>(results: Iterable<T> | Record<string, T>): AnyResult => {
  if (isIterable(results)) {
    return allIterable(results)
  }
  return allRecord(results)
}

type BuilderFor<A extends AnyResult> = Builder<
  never,
  A extends Success<infer _A, infer _E> ? _A : never,
  A extends Failure<infer _A, infer _E> ? _E : never,
  A extends Initial<infer _A, infer _E> ? true : never,
  A extends Failure<infer _A, infer _E> ? Defect | Interrupt : never
>

/**
 * Creates a typed builder for rendering an `Result` by handling waiting, initial, success, error, defect, interrupt, and failure cases.
 *
 * @since 4.0.0
 */
export function builder<A extends AnyResult>(self: A): BuilderFor<A>
/**
 * The implementation signature is erased because `Builder` is a phantom state
 * machine and `BuilderImpl` is not. `Builder` records what has been handled in
 * its own parameters - `onError` returns a builder whose error type is `never`,
 * `onDefect` drops `Defect` from the outstanding set - while the class keeps one
 * mutable value and its parameters unchanged, so no instantiation of it relates
 * to `BuilderFor` (measured: TS2322 through `onWaiting` into `onErrorIf`). The
 * declaration above is the contract; the class is the mechanism.
 */
export function builder(self: AnyResult): Top {
  return new BuilderImpl<never, Top, Top>(self)
}

/**
 * Type marker used by `Builder` to track whether defect failures still need to be handled.
 *
 * @since 4.0.0
 */
export interface Defect {
  readonly _: unique symbol
}

/**
 * Type marker used by `Builder` to track whether interrupt failures still need to be handled.
 *
 * @since 4.0.0
 */
export interface Interrupt {
  readonly _: unique symbol
}

/**
 * Fluent renderer for `Result` values that tracks unhandled cases at the type level and exposes `exhaustive` only after all possible cases are handled.
 *
 * @since 4.0.0
 */
export type Builder<Out, A, E, I, F> =
  & Pipeable
  & {
    onWaiting<B>(f: (result: Result<A, E>) => B): Builder<Out | B, A, E, I, F>
    orElse<B>(orElse: LazyArg<B>): Out | B
    orNull(): Out | null
    render(): [A | I] extends [never] ? Out : Out | null
  }
  & ([A | E | I | F] extends [never] ? {
      exhaustive(): Out
    }
    : Top)
  & ([I] extends [never] ? Top
    : {
      onInitial<B>(f: (result: Initial<A, E>) => B): Builder<Out | B, A, E, never, F>
      onInitialOrWaiting<B>(f: (result: Result<A, E>) => B): Builder<Out | B, A, E, never, F>
    })
  & ([A] extends [never] ? Top
    : {
      onSuccess<B>(f: (value: A, result: Success<A, E>) => B): Builder<Out | B, never, E, I, F>
    })
  & ([E] extends [never] ? Top : {
    onError<B>(f: (error: E, result: Failure<A, E>) => B): Builder<Out | B, A, never, I, F>

    onErrorIf<B extends E, C>(
      refinement: Refinement<E, B>,
      f: (error: B, result: Failure<A, E>) => C,
    ): Builder<Out | C, A, Types.EqualsWith<E, B, E, Exclude<E, B>>, I, F>
    onErrorIf<C>(
      predicate: Predicate<E>,
      f: (error: E, result: Failure<A, E>) => C,
    ): Builder<Out | C, A, E, I, F>

    onErrorTag<const Tags extends readonly Types.Tags<E>[], B>(
      tags: Tags,
      f: (error: Types.ExtractTag<E, Tags[number]>, result: Failure<A, E>) => B,
    ): Builder<Out | B, A, Types.ExcludeTag<E, Tags[number]>, I, F>
    onErrorTag<const Tag extends Types.Tags<E>, B>(
      tag: Tag,
      f: (error: Types.ExtractTag<E, Tag>, result: Failure<A, E>) => B,
    ): Builder<Out | B, A, Types.ExcludeTag<E, Tag>, I, F>
  })
  & ([E | F] extends [never] ? Top : {
    onFailure<B>(f: (cause: Cause.Cause<E>, result: Failure<A, E>) => B): Builder<Out | B, A, never, I, never>
  })
  & (Interrupt extends F ? {
      onInterrupt<B>(
        f: (interruptors: ReadonlySet<number>, result: Failure<A, E>) => B,
      ): Builder<Out | B, A, E, I, Exclude<F, Interrupt>>
    }
    : Top)
  & (Defect extends F ? {
      onDefect<B>(f: (defect: Top, result: Failure<A, E>) => B): Builder<Out | B, A, E, I, Exclude<F, Defect>>
    }
    : Top)

const errorMatchesTag = <E = unknown>(tag: string | readonly string[], e: E): boolean => {
  if (typeof tag === 'string') {
    return isTagged(e, tag)
  }
  return tag.some((t) => isTagged(e, t))
}

const defectOption = <A, E, B>(
  result: Failure<A, E>,
  f: (defect: Top, result: Failure<A, E>) => B,
): Option.Option<B> => {
  const defect = Cause.findDefect(result.cause)
  if (Either.isFailure(defect)) {
    return Option.none()
  }
  return Option.some(f(defect.success, result))
}

const interruptOption = <A, E, B>(
  result: Failure<A, E>,
  f: (interruptors: ReadonlySet<number>, result: Failure<A, E>) => B,
): Option.Option<B> => {
  const interruptors = Cause.filterInterruptors(result.cause)
  if (Either.isFailure(interruptors)) {
    return Option.none()
  }
  return Option.some(f(interruptors.success, result))
}

class BuilderImpl<Out, A, E> extends PipeableModule.Class {
  constructor(result: Result<A, E>) {
    super()
    this.result = result
  }
  readonly result: Result<A, E>
  private output: Option.Option<Top> = Option.none()

  when<B extends Result<A, E>, C>(
    refinement: Refinement<Result<A, E>, B>,
    f: (result: B) => Option.Option<C>,
  ): BuilderImpl<Out | C, A, E>
  when<C>(
    refinement: Predicate<Result<A, E>>,
    f: (result: Result<A, E>) => Option.Option<C>,
  ): BuilderImpl<Out | C, A, E>
  when<C>(
    refinement: Predicate<Result<A, E>>,
    f: (result: Result<A, E>) => Option.Option<C>,
  ): BuilderImpl<Out | C, A, E> {
    if (Option.isNone(this.output)) {
      this.tryWhen(refinement, f)
    }
    return this
  }

  private tryWhen<C>(
    refinement: Predicate<Result<A, E>>,
    f: (result: Result<A, E>) => Option.Option<C>,
  ): void {
    if (refinement(this.result)) {
      this.captureWhen(f(this.result))
    }
  }

  private captureWhen(value: Option.Option<Top>): void {
    if (Option.isSome(value)) {
      this.output = value
    }
  }

  onWaiting<B>(f: (result: Result<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when((r) => r.waiting, (r) => Option.some(f(r)))
  }

  onInitialOrWaiting<B>(f: (result: Result<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when((r) => isInitial(r) || r.waiting, (r) => Option.some(f(r)))
  }

  onInitial<B>(f: (result: Initial<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isInitial, (r) => Option.some(f(r)))
  }

  onSuccess<B>(f: (value: A, result: Success<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isSuccess, (r) => Option.some(f(r.value, r)))
  }

  onFailure<B>(f: (cause: Cause.Cause<E>, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isFailure, (r) => Option.some(f(r.cause, r)))
  }

  onError<B>(f: (error: E, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.onErrorIf(constTrue, f)
  }

  onErrorIf<C>(
    refinement: Predicate<E>,
    f: (error: E, result: Failure<A, E>) => C,
  ): BuilderImpl<Out | C, A, E> {
    return this.when(isFailure, (result) =>
      Cause.findErrorOption(result.cause).pipe(
        Option.filter(refinement),
        Option.map((error) => f(error, result)),
      ))
  }

  onErrorTag<B>(
    tag: string | readonly string[],
    f: (error: E, result: Failure<A, E>) => B,
  ): BuilderImpl<Out | B, A, E> {
    return this.onErrorIf(
      (e) => errorMatchesTag(tag, e),
      f,
    )
  }

  onDefect<B>(f: (defect: Top, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isFailure, (result) => defectOption(result, f))
  }

  onInterrupt<B>(f: (interruptors: ReadonlySet<number>, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isFailure, (result) => interruptOption(result, f))
  }

  orElse<B>(orElse: LazyArg<B>): Out | B
  orElse(orElse: LazyArg<Top>): Top {
    return Option.getOrElse(this.output, orElse)
  }

  orNull(): Out | null
  orNull(): Top {
    return Option.getOrNull(this.output)
  }

  render(): Out | null
  render(): Top {
    if (Option.isSome(this.output)) {
      return this.output.value
    }
    return this.renderMissing()
  }

  private renderMissing(): Top {
    if (isFailure(this.result)) {
      throw Cause.squash(this.result.cause)
    }
    return null
  }

  exhaustive(): Out
  exhaustive(): Top {
    return this.render()
  }
}

export { Schema } from './ResultSchema.js'
