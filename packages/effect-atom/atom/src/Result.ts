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
import * as Equal from 'effect/Equal'
import * as Exit from 'effect/Exit'
import type { LazyArg } from 'effect/Function'
import { constTrue, dual, identity } from 'effect/Function'
import * as Hash from 'effect/Hash'

import * as Option from 'effect/Option'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'
import type { Predicate, Refinement } from 'effect/Predicate'
import { hasProperty, isIterable } from 'effect/Predicate'
import * as Either from 'effect/Result'
import type * as Types from 'effect/Types'

/**
 * Type-level identifier used to recognize `Result` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = '~effect-atom/atom/Result'

/**
 * Runtime identifier attached to `Result` values and used by `isResult`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = '~effect-atom/atom/Result'

/**
 * Represents the state of an asynchronous value as `Initial`, `Success`, or `Failure`, with a `waiting` flag for in-flight refreshes.
 *
 * @category models
 * @since 4.0.0
 */
export type Result<A, E = never> = Initial<A, E> | Success<A, E> | Failure<A, E>

/**
 * Returns `true` when a value is an `Result`.
 *
 * @category guards
 * @since 4.0.0
 */
export const isResult = (u: unknown): u is Result<unknown, unknown> => hasProperty(u, TypeId)
// alias: upstream names this guard `isAsyncResult`
export { isResult as isAsyncResult }

/**
 * Namespace containing type-level helpers and the shared prototype shape for `Result` values.
 *
 * @since 4.0.0
 */
export declare namespace Result {
  /**
   * Common prototype fields implemented by every `Result` variant, including pipeability, the type marker, phantom type members, and the `waiting` flag.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Proto<A, E> extends Pipeable {
    readonly [TypeId]: {
      readonly E: (_: never) => E
      readonly A: (_: never) => A
    }
    readonly waiting: boolean
  }

  /**
   * Extracts the success value type from an `Result`.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Success<R> = R extends Result<infer A, infer _> ? A : never

  /**
   * Extracts the failure error type from an `Result`.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Failure<R> = R extends Result<infer _, infer E> ? E : never
}

/**
 * Rebuilds an `Result` with new success and failure types while preserving the variant of another result.
 *
 * @category utility types
 * @since 4.0.0
 */
export type With<R extends Result<any, any>, A, E> = R extends Initial<infer _A, infer _E> ? Initial<A, E>
  : R extends Success<infer _A, infer _E> ? Success<A, E>
  : R extends Failure<infer _A, infer _E> ? Failure<A, E>
  : never

const ResultProto = {
  [TypeId]: {
    E: identity,
    A: identity,
  },
  pipe() {
    return pipeArguments(this, arguments)
  },
  [Equal.symbol](this: Result<any, any>, that: Result<any, any>): boolean {
    if (this._tag !== that._tag || this.waiting !== that.waiting) {
      return false
    }
    switch (this._tag) {
      case 'Initial':
        return true
      case 'Success':
        return Equal.equals(this.value, (that as Success<any, any>).value)
      case 'Failure':
        return Equal.equals(this.cause, (that as Failure<any, any>).cause)
    }
  },
  [Hash.symbol](this: Result<any, any>): number {
    const tagHash = Hash.string(`${this._tag}:${this.waiting}`)
    if (this._tag === 'Initial') {
      return tagHash
    }
    return Hash.combine(tagHash)(this._tag === 'Success' ? Hash.hash(this.value) : Hash.hash(this.cause))
  },
}

/**
 * Returns whether an `Result` is currently waiting for an asynchronous computation or refresh to finish.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isWaiting = <A, E>(result: Result<A, E>): boolean => result.waiting

/**
 * Initial `Result` state before a success value or failure cause is available.
 *
 * @category models
 * @since 4.0.0
 */
export interface Initial<A, E = never> extends Result.Proto<A, E> {
  readonly _tag: 'Initial'
}

/**
 * Converts an `Exit` into a `Success` when it succeeds or a `Failure` carrying the exit cause when it fails.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromExit = <A, E>(exit: Exit.Exit<A, E>): Success<A, E> | Failure<A, E> =>
  exit._tag === 'Success' ? success(exit.value) : failure(exit.cause)

/**
 * Converts an `Exit` to a result, preserving the latest previous success when the exit is a failure.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromExitWithPrevious = <A, E>(
  exit: Exit.Exit<A, E>,
  previous: Option.Option<Result<A, E>>,
): Success<A, E> | Failure<A, E> =>
  exit._tag === 'Success' ? success(exit.value) : failureWithPrevious(exit.cause, { previous })

/**
 * Creates a waiting result from an optional previous result, using `Initial(true)` when no previous result exists.
 *
 * @category constructors
 * @since 4.0.0
 */
export const waitingFrom = <A, E>(previous: Option.Option<Result<A, E>>): Result<A, E> => {
  if (previous._tag === 'None') {
    return initial(true)
  }
  return waiting(previous.value)
}

/**
 * Returns `true` when an `Result` is in the `Initial` state.
 *
 * @category guards
 * @since 4.0.0
 */
export const isInitial = <A, E>(result: Result<A, E>): result is Initial<A, E> => result._tag === 'Initial'

/**
 * Returns `true` when an `Result` is either `Success` or `Failure`.
 *
 * @category guards
 * @since 4.0.0
 */
export const isNotInitial = <A, E>(result: Result<A, E>): result is Success<A, E> | Failure<A, E> =>
  result._tag !== 'Initial'

/**
 * Creates an `Initial` result, optionally marking it as waiting.
 *
 * @category constructors
 * @since 4.0.0
 */
export const initial = <A = never, E = never>(waiting = false): Initial<A, E> => {
  const result = Object.create(ResultProto)
  result._tag = 'Initial'
  result.waiting = waiting
  return result
}

/**
 * Successful `Result` containing the current value, its timestamp, and the shared waiting flag.
 *
 * @category models
 * @since 4.0.0
 */
export interface Success<A, E = never> extends Result.Proto<A, E> {
  readonly _tag: 'Success'
  readonly value: A
  readonly timestamp: number
}

/**
 * Returns `true` when an `Result` is a `Success`.
 *
 * @category guards
 * @since 4.0.0
 */
export const isSuccess = <A, E>(result: Result<A, E>): result is Success<A, E> => result._tag === 'Success'

/**
 * Creates a `Success` result with a value and optional `waiting` flag or timestamp override.
 *
 * @category constructors
 * @since 4.0.0
 */
export const success = <A, E = never>(value: A, options?: {
  readonly waiting?: boolean | undefined
  readonly timestamp?: number | undefined
}): Success<A, E> => {
  const result = Object.create(ResultProto)
  result._tag = 'Success'
  result.value = value
  result.waiting = options?.waiting ?? false
  result.timestamp = options?.timestamp ?? Date.now()
  return result
}

/**
 * Failed `Result` containing a failure cause and the latest previous success when one is available.
 *
 * @category models
 * @since 4.0.0
 */
export interface Failure<A, E = never> extends Result.Proto<A, E> {
  readonly _tag: 'Failure'
  readonly cause: Cause.Cause<E>
  readonly previousSuccess: Option.Option<Success<A, E>>
}

/**
 * Returns `true` when an `Result` is a `Failure`.
 *
 * @category guards
 * @since 4.0.0
 */
export const isFailure = <A, E>(result: Result<A, E>): result is Failure<A, E> => result._tag === 'Failure'

/**
 * Returns `true` when an `Result` is a `Failure` whose cause contains only interruptions.
 *
 * @category guards
 * @since 4.0.0
 */
export const isInterrupted = <A, E>(result: Result<A, E>): result is Failure<A, E> =>
  result._tag === 'Failure' && Cause.hasInterruptsOnly(result.cause)

/**
 * Creates a `Failure` result from a `Cause`, optionally preserving a previous success and marking the result as waiting.
 *
 * @category constructors
 * @since 4.0.0
 */
export const failure = <A, E = never>(
  cause: Cause.Cause<E>,
  options?: {
    readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
    readonly waiting?: boolean | undefined
  },
): Failure<A, E> => {
  const result = Object.create(ResultProto)
  result._tag = 'Failure'
  result.cause = cause
  result.previousSuccess = options?.previousSuccess ?? Option.none()
  result.waiting = options?.waiting ?? false
  return result
}

/**
 * Creates a `Failure` result from a `Cause`, carrying forward the latest success stored in a previous result.
 *
 * @category constructors
 * @since 4.0.0
 */
export const failureWithPrevious = <A, E>(
  cause: Cause.Cause<E>,
  options: {
    readonly previous: Option.Option<Result<A, E>>
    readonly waiting?: boolean | undefined
  },
): Failure<A, E> =>
  failure(cause, {
    previousSuccess: Option.flatMap(options.previous, (result) =>
      isSuccess(result)
        ? Option.some(result)
        : isFailure(result)
        ? result.previousSuccess
        : Option.none()),
    waiting: options.waiting,
  })

/**
 * Creates a `Failure` result from a typed error, wrapping it in `Cause.fail`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fail = <E, A = never>(error: E, options?: {
  readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
  readonly waiting?: boolean | undefined
}): Failure<A, E> => failure(Cause.fail(error), options)

/**
 * Creates a `Failure` result from a typed error while carrying forward the latest success stored in a previous result.
 *
 * @category constructors
 * @since 4.0.0
 */
export const failWithPrevious = <A, E>(
  error: E,
  options: {
    readonly previous: Option.Option<Result<A, E>>
    readonly waiting?: boolean | undefined
  },
): Failure<A, E> => failureWithPrevious(Cause.fail(error), options)

/**
 * Marks an `Result` as waiting, optionally touching the timestamp when the result is a `Success`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const waiting = <R extends Result<any, any>>(self: R, options?: {
  readonly touch?: boolean | undefined
}): R => {
  if (self.waiting) {
    return options?.touch ? touch(self) : self
  }
  const result = Object.assign(Object.create(ResultProto), self, { waiting: true })
  return options?.touch ? touch(result) : result
}

/**
 * Refreshes the timestamp of a `Success` result while preserving its value and waiting flag; non-success results are returned unchanged.
 *
 * @category combinators
 * @since 4.0.0
 */
export const touch = <A extends Result<any, any>>(result: A): A => {
  if (isSuccess(result)) {
    return success(result.value, { waiting: result.waiting }) as A
  }
  return result
}

/**
 * Replaces a `Failure` value's stored previous success with the latest success
 * found in another result.
 *
 * @category combinators
 * @since 4.0.0
 */
export const replacePrevious = <R extends Result<any, any>, XE, A>(
  self: R,
  previous: Option.Option<Result<A, XE>>,
): With<R, A, Result.Failure<R>> => replacePreviousImpl(self, previous) as With<R, A, Result.Failure<R>>

const replacePreviousImpl = (
  self: Result<any, any>,
  previous: Option.Option<Result<any, any>>,
): Result<any, any> =>
  self._tag === 'Failure' ? failureWithPrevious(self.cause, { previous, waiting: self.waiting }) : self

/**
 * Returns the current success value, or the previous success value stored in a failure, as an `Option`.
 *
 * @category accessors
 * @since 4.0.0
 */
export const value = <A, E>(self: Result<A, E>): Option.Option<A> => {
  if (self._tag === 'Success') {
    return Option.some(self.value)
  } else if (self._tag === 'Failure') {
    return Option.map(self.previousSuccess, (s) => s.value)
  }
  return Option.none()
}

/**
 * Returns the available value from `value`, or evaluates the fallback when no current or previous success exists.
 *
 * @category accessors
 * @since 4.0.0
 */
export const getOrElse: {
  <B>(orElse: LazyArg<B>): <A, E>(self: Result<A, E>) => A | B
  <A, E, B>(self: Result<A, E>, orElse: LazyArg<B>): A | B
} = dual(2, <A, E, B>(self: Result<A, E>, orElse: LazyArg<B>): A | B => Option.getOrElse(value(self), orElse))

/**
 * Returns the available value from `value`, or throws `NoSuchElementError` when no current or previous success exists.
 *
 * @category accessors
 * @since 4.0.0
 */
export const getOrThrow = <A, E>(self: Result<A, E>): A =>
  Option.getOrThrowWith(value(self), () => new Cause.NoSuchElementError('Result.getOrThrow: no value found'))

/**
 * Returns the failure cause when the result is a `Failure`, otherwise `None`.
 *
 * @category accessors
 * @since 4.0.0
 */
export const cause = <A, E>(self: Result<A, E>): Option.Option<Cause.Cause<E>> =>
  self._tag === 'Failure' ? Option.some(self.cause) : Option.none()

/**
 * Returns the first typed error from a failure cause, or `None` for successes, initial results, defects, and interrupt-only causes.
 *
 * @category accessors
 * @since 4.0.0
 */
export const error = <A, E>(self: Result<A, E>): Option.Option<E> =>
  self._tag === 'Failure' ? Cause.findErrorOption(self.cause) : Option.none()

/**
 * Converts a result to an `Exit`, succeeding with a success value, failing with a failure cause, or failing with `NoSuchElementError` for `Initial`.
 *
 * @category combinators
 * @since 4.0.0
 */
export const toExit: {
  <A, E>(self: Success<A, E> | Failure<A, E>): Exit.Exit<A, E>
  <A, E>(self: Result<A, E>): Exit.Exit<A, E | Cause.NoSuchElementError>
} = <A, E>(
  self: Result<A, E>,
): Exit.Exit<A, E | Cause.NoSuchElementError> => {
  switch (self._tag) {
    case 'Success': {
      return Exit.succeed(self.value)
    }
    case 'Failure': {
      return Exit.failCause(self.cause)
    }
    default: {
      return Exit.fail(new Cause.NoSuchElementError())
    }
  }
}

/**
 * Maps the success value of an `Result`, also mapping any previous success stored in a failure while leaving initial results unchanged.
 *
 * @category combinators
 * @since 4.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): <E>(self: Result<A, E>) => Result<B, E>
  <E, A, B>(self: Result<A, E>, f: (a: A) => B): Result<B, E>
} = dual(2, <E, A, B>(self: Result<A, E>, f: (a: A) => B): Result<B, E> => {
  switch (self._tag) {
    case 'Initial':
      return initial(self.waiting)
    case 'Failure':
      return failure(self.cause, {
        previousSuccess: Option.map(self.previousSuccess, (s) => success(f(s.value), s)),
        waiting: self.waiting,
      })
    case 'Success':
      return success(f(self.value), self)
  }
})

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
 * @category combinators
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
    switch (self._tag) {
      case 'Initial':
        return initial(self.waiting)
      case 'Failure':
        return failure<B, E | E2>(self.cause, {
          previousSuccess: Option.flatMap(self.previousSuccess, (s) => {
            const next = f(s.value, s)
            return isSuccess(next) ? Option.some(next) : Option.none()
          }),
          waiting: self.waiting,
        })
      case 'Success':
        return f(self.value, self)
    }
  },
)

/**
 * Pattern matches an `Result` by calling the handler for `Initial`, `Failure`, or `Success`.
 *
 * @category combinators
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
  switch (self._tag) {
    case 'Initial':
      return options.onInitial(self)
    case 'Failure':
      return options.onFailure(self)
    case 'Success':
      return options.onSuccess(self)
  }
})

/**
 * Pattern matches a result, handling successes and initials directly while splitting failures into typed errors or squashed non-error causes passed to `onDefect`.
 *
 * @category combinators
 * @since 4.0.0
 */
export const matchWithError: {
  <A, E, W, X, Y, Z>(options: {
    readonly onInitial: (_: Initial<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: unknown, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): (self: Result<A, E>) => W | X | Y | Z
  <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
    readonly onInitial: (_: Initial<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: unknown, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): W | X | Y | Z
} = dual(2, <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
  readonly onInitial: (_: Initial<A, E>) => W
  readonly onError: (error: E, _: Failure<A, E>) => X
  readonly onDefect: (defect: unknown, _: Failure<A, E>) => Y
  readonly onSuccess: (_: Success<A, E>) => Z
}): W | X | Y | Z => {
  switch (self._tag) {
    case 'Initial':
      return options.onInitial(self)
    case 'Failure': {
      const result = Cause.findError(self.cause)
      if (Either.isFailure(result)) {
        return options.onDefect(Cause.squash(result.failure), self)
      }
      return options.onError(result.success, self)
    }
    case 'Success':
      return options.onSuccess(self)
  }
})

/**
 * Pattern matches a result by calling `onWaiting` for waiting or initial states, otherwise handling successes and splitting failures into typed errors or squashed non-error causes.
 *
 * @category combinators
 * @since 4.0.0
 */
export const matchWithWaiting: {
  <A, E, W, X, Y, Z>(options: {
    readonly onWaiting: (_: Result<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: unknown, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): (self: Result<A, E>) => W | X | Y | Z
  <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
    readonly onWaiting: (_: Result<A, E>) => W
    readonly onError: (error: E, _: Failure<A, E>) => X
    readonly onDefect: (defect: unknown, _: Failure<A, E>) => Y
    readonly onSuccess: (_: Success<A, E>) => Z
  }): W | X | Y | Z
} = dual(2, <A, E, W, X, Y, Z>(self: Result<A, E>, options: {
  readonly onWaiting: (_: Result<A, E>) => W
  readonly onError: (error: E, _: Failure<A, E>) => X
  readonly onDefect: (defect: unknown, _: Failure<A, E>) => Y
  readonly onSuccess: (_: Success<A, E>) => Z
}): W | X | Y | Z => {
  if (self.waiting) {
    return options.onWaiting(self)
  }
  switch (self._tag) {
    case 'Initial':
      return options.onWaiting(self)
    case 'Failure': {
      const e = Cause.findError(self.cause)
      if (Either.isFailure(e)) {
        return options.onDefect(Cause.squash(e.failure), self)
      }
      return options.onError(e.success, self)
    }
    case 'Success':
      return options.onSuccess(self)
  }
})

/**
 * Combines an iterable or record of `Result` and plain values into one `Result`, returning the first non-success result or a success of the collected values marked waiting when any input success is waiting.
 *
 * @category combinators
 * @since 4.0.0
 */
type AllSuccess<Arg> = [Arg] extends [readonly any[]] ? {
    -readonly [K in keyof Arg]: [Arg[K]] extends [Result<infer _A, infer _E>] ? _A : Arg[K]
  }
  : [Arg] extends [Iterable<infer _A>] ? _A extends Result<infer _AA, infer _E> ? _AA : _A
  : [Arg] extends [Record<string, any>] ? {
      -readonly [K in keyof Arg]: [Arg[K]] extends [Result<infer _A, infer _E>] ? _A : Arg[K]
    }
  : never

type AllError<Arg> = [Arg] extends [readonly any[]] ? Result.Failure<Arg[number]>
  : [Arg] extends [Iterable<infer _A>] ? Result.Failure<_A>
  : [Arg] extends [Record<string, any>] ? Result.Failure<Arg[keyof Arg]>
  : never

export const all = <const Arg extends Iterable<any> | Record<string, any>>(
  results: Arg,
): Result<AllSuccess<Arg>, AllError<Arg>> => allImpl(results) as Result<AllSuccess<Arg>, AllError<Arg>>

const allImpl = (results: Iterable<any> | Record<string, any>): Result<unknown, unknown> => {
  let waiting = false
  if (isIterable(results)) {
    const list = Array.from(results)
    const successes: unknown[] = []
    for (let i = 0; i < list.length; i++) {
      const result = list[i]!
      if (!isResult(result)) {
        successes[i] = result
        continue
      }
      if (!isSuccess(result)) {
        return result
      }
      successes[i] = result.value
      if (result.waiting) {
        waiting = true
      }
    }
    return success(successes, { waiting })
  }
  const successes: Record<string, unknown> = {}
  for (const [key, result] of Object.entries(results)) {
    if (!isResult(result)) {
      successes[key] = result
      continue
    }
    if (!isSuccess(result)) {
      return result
    }
    successes[key] = result.value
    if (result.waiting) {
      waiting = true
    }
  }
  return success(successes, { waiting })
}

/**
 * Creates a typed builder for rendering an `Result` by handling waiting, initial, success, error, defect, interrupt, and failure cases.
 *
 * @category constructors
 * @since 4.0.0
 */
type BuilderFor<A extends Result<any, any>> = Builder<
  never,
  A extends Success<infer _A, infer _E> ? _A : never,
  A extends Failure<infer _A, infer _E> ? _E : never,
  A extends Initial<infer _A, infer _E> ? true : never,
  A extends Failure<infer _A, infer _E> ? Defect | Interrupt : never
>

export const builder = <A extends Result<any, any>>(self: A): BuilderFor<A> => {
  // BuilderImpl is structurally compatible with Builder for any concrete A,
  // but the conditional members of Builder cannot be verified while A is
  // unresolved — assert the boundary once, here.
  const built: unknown = new BuilderImpl(self)
  return built as BuilderFor<A>
}

/**
 * Type marker used by `Builder` to track whether defect failures still need to be handled.
 *
 * @category utility types
 * @since 4.0.0
 */
export interface Defect {
  readonly _: unique symbol
}

/**
 * Type marker used by `Builder` to track whether interrupt failures still need to be handled.
 *
 * @category utility types
 * @since 4.0.0
 */
export interface Interrupt {
  readonly _: unique symbol
}

/**
 * Fluent renderer for `Result` values that tracks unhandled cases at the type level and exposes `exhaustive` only after all possible cases are handled.
 *
 * @category models
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
    : unknown)
  & ([I] extends [never] ? unknown
    : {
      onInitial<B>(f: (result: Initial<A, E>) => B): Builder<Out | B, A, E, never, F>
      onInitialOrWaiting<B>(f: (result: Result<A, E>) => B): Builder<Out | B, A, E, never, F>
    })
  & ([A] extends [never] ? unknown
    : {
      onSuccess<B>(f: (value: A, result: Success<A, E>) => B): Builder<Out | B, never, E, I, F>
    })
  & ([E] extends [never] ? unknown : {
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
  & ([E | F] extends [never] ? unknown : {
    onFailure<B>(f: (cause: Cause.Cause<E>, result: Failure<A, E>) => B): Builder<Out | B, A, never, I, never>
  })
  & (Interrupt extends F ? {
      onInterrupt<B>(
        f: (interruptors: ReadonlySet<number>, result: Failure<A, E>) => B,
      ): Builder<Out | B, A, E, I, Exclude<F, Interrupt>>
    }
    : unknown)
  & (Defect extends F ? {
      onDefect<B>(f: (defect: unknown, result: Failure<A, E>) => B): Builder<Out | B, A, E, I, Exclude<F, Defect>>
    }
    : unknown)

class BuilderImpl<Out, A, E> {
  constructor(result: Result<A, E>) {
    this.result = result
  }
  readonly result: Result<A, E>
  private output: Option.Option<unknown> = Option.none()

  when<B extends Result<A, E>, C>(
    refinement: Refinement<Result<A, E>, B>,
    f: (result: B) => Option.Option<C>,
  ): any
  when<C>(
    refinement: Predicate<Result<A, E>>,
    f: (result: Result<A, E>) => Option.Option<C>,
  ): any
  when<C>(
    refinement: Predicate<Result<A, E>>,
    f: (result: Result<A, E>) => Option.Option<C>,
  ): any {
    if (Option.isNone(this.output) && refinement(this.result)) {
      const b = f(this.result)
      if (Option.isSome(b)) {
        this.output = b
      }
    }
    return this
  }

  pipe() {
    return pipeArguments(this, arguments)
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

  onSuccess<B>(f: (value: A, result: Success<A, E>) => B): BuilderImpl<Out | B, never, E> {
    return this.when(isSuccess, (r) => Option.some(f(r.value, r)))
  }

  onFailure<B>(f: (cause: Cause.Cause<E>, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, never> {
    return this.when(isFailure, (r) => Option.some(f(r.cause, r)))
  }

  onError<B>(f: (error: E, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, never> {
    return this.onErrorIf(constTrue, f) as BuilderImpl<Out | B, A, never>
  }

  onErrorIf<C, B extends E = E>(
    refinement: Refinement<E, B> | Predicate<E>,
    f: (error: B, result: Failure<A, E>) => C,
  ): BuilderImpl<Out | C, A, Types.EqualsWith<E, B, E, Exclude<E, B>>> {
    return this.when(isFailure, (result) =>
      Cause.findErrorOption(result.cause).pipe(
        Option.filter(refinement),
        Option.map((error) => f(error as B, result)),
      ))
  }

  onErrorTag<B>(
    tag: string | readonly string[],
    f: (error: Types.ExtractTag<E, any>, result: Failure<A, E>) => B,
  ): BuilderImpl<Out | B, A, Types.ExcludeTag<E, any>> {
    return this.onErrorIf(
      (e) => hasProperty(e, '_tag') && (Array.isArray(tag) ? tag.includes(e._tag) : e._tag === tag),
      f,
    ) as BuilderImpl<Out | B, A, Types.ExcludeTag<E, any>>
  }

  onDefect<B>(f: (defect: unknown, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isFailure, (result) => {
      const defect = Cause.findDefect(result.cause)
      return Either.isFailure(defect) ? Option.none() : Option.some(f(defect.success, result))
    })
  }

  onInterrupt<B>(f: (interruptors: ReadonlySet<number>, result: Failure<A, E>) => B): BuilderImpl<Out | B, A, E> {
    return this.when(isFailure, (result) => {
      const interruptors = Cause.filterInterruptors(result.cause)
      return Either.isFailure(interruptors) ? Option.none() : Option.some(f(interruptors.success, result))
    })
  }

  orElse<B>(orElse: LazyArg<B>): Out | B {
    return Option.getOrElse(this.output, orElse) as Out | B
  }

  orNull(): Out | null {
    return Option.getOrNull(this.output) as Out | null
  }

  render(): Out | null {
    if (Option.isSome(this.output)) {
      return this.output.value as Out
    } else if (isFailure(this.result)) {
      throw Cause.squash(this.result.cause)
    }
    return null
  }

  exhaustive(): Out {
    return this.render() as Out
  }
}

export { Schema } from './internal/result-schema.js'
