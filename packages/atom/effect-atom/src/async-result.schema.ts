/**
 * The `Result` model: the type, its schema codec, and every pure operation
 * that builds, inspects, maps, matches or combines a result.
 *
 * Clock-reading entry points live in `./async-result.js`, which delegates here
 * for the pure construction and keeps every public name.
 *
 * @since 4.0.0
 */
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Exit from 'effect/Exit'
import { constTrue, dual, identity, type LazyArg } from 'effect/Function'
import * as Hash from 'effect/Hash'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as PipeableModule from 'effect/Pipeable'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'
import { hasProperty, isIterable, isTagged, type Predicate, type Refinement } from 'effect/Predicate'
import * as Either from 'effect/Result'
import * as Schema_ from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaParser from 'effect/SchemaParser'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import type * as Types from 'effect/Types'
/**
 * Type-level identifier used to recognize `Result` values.
 *
 * @since 4.0.0
 */

export type TypeId = '~effect-atom/atom/Result'

/**
 * Runtime identifier attached to `Result` values and used by `isResult`.
 *
 * @since 4.0.0
 */

export const TypeId: TypeId = '~effect-atom/atom/Result'

/**
 * Namespace containing the shared prototype shape and type-level helpers for
 * `Result` values. The interface members are declared ahead of their use in
 * the variant interfaces below.
 *
 * @since 4.0.0
 */
export declare namespace Result {
  /**
   * Common prototype fields implemented by every `Result` variant, including
   * pipeability, the type marker, phantom type members, and the `waiting` flag.
   *
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
   * @since 4.0.0
   */
  export type Success<R> = R extends Result<infer A, infer _> ? A : never

  /**
   * Extracts the failure error type from an `Result`.
   *
   * @since 4.0.0
   */
  export type Failure<R> = R extends Result<infer _, infer E> ? E : never
}

/**
 * Represents the state of an asynchronous value as `Initial`, `Success`, or
 * `Failure`, with a `waiting` flag for in-flight refreshes.
 *
 * @since 4.0.0
 */

export type Result<A, E = never> = Initial<A, E> | Success<A, E> | Failure<A, E>

type AnyResult<A = unknown, E = unknown> = Result<A, E>

/**
 * Shared prototype every `Result` variant inherits from. The three
 * constructors (`initial`, `success`, `failure`) use it; `waiting` in
 * `Result.ts` also reaches it directly.
 *
 * The schema codec (`internal/result-schema.ts`) serializes only the tagged
 * variant fields (`value`, `waiting`, `timestamp`, `cause`,
 * `previousSuccess`) — nothing added to this prototype is wire-carried, so
 * any future proto-private state must be mirrored in that encode/decode pair.
 *
 * @since 4.0.0
 */

const ResultProto = {
  [TypeId]: {
    E: identity,
    A: identity,
  },
  pipe() {
    return pipeArguments(this, arguments)
  },
  [Equal.symbol](this: AnyResult, that: AnyResult): boolean {
    if (this.waiting !== that.waiting) {
      return false
    }
    return Match.value(this).pipe(
      Match.tag('Initial', () => Match.value(that).pipe(Match.tag('Initial', () => true), Match.orElse(() => false))),
      Match.tag(
        'Success',
        (s) =>
          Match.value(that).pipe(
            Match.tag('Success', (t) => Equal.equals(s.value, t.value)),
            Match.orElse(() => false),
          ),
      ),
      Match.tag(
        'Failure',
        (f) =>
          Match.value(that).pipe(
            Match.tag('Failure', (g) => Equal.equals(f.cause, g.cause)),
            Match.orElse(() => false),
          ),
      ),
      Match.exhaustive,
    )
  },
  [Hash.symbol](this: AnyResult): number {
    const tagHash = Hash.string(`${this._tag}:${this.waiting}`)
    return Match.value(this).pipe(
      Match.tag('Initial', () => tagHash),
      Match.tag('Success', (s) => Hash.combine(tagHash)(Hash.hash(s.value))),
      Match.tag('Failure', (f) => Hash.combine(tagHash)(f.cause.pipe(Hash.hash))),
      Match.exhaustive,
    )
  },
}

const InitialTag = { _tag: 'Initial' } as const

export type InitialTag = typeof InitialTag

/**
 * Initial `Result` state before a success value or failure cause is available.
 *
 * @since 4.0.0
 */

export interface Initial<A, E = never> extends Result.Proto<A, E>, InitialTag {}

const SuccessTag = { _tag: 'Success' } as const

export type SuccessTag = typeof SuccessTag

/**
 * Successful `Result` containing the current value, its timestamp, and the
 * shared waiting flag.
 *
 * @since 4.0.0
 */

export interface Success<A, E = never> extends Result.Proto<A, E>, SuccessTag {
  readonly value: A
  readonly timestamp: number
}

const FailureTag = { _tag: 'Failure' } as const

export type FailureTag = typeof FailureTag

/**
 * Failed `Result` containing a failure cause and the latest previous success
 * when one is available.
 *
 * @since 4.0.0
 */

export interface Failure<A, E = never> extends Result.Proto<A, E>, FailureTag {
  readonly cause: Cause.Cause<E>
  readonly previousSuccess: Option.Option<Success<A, E>>
}

/**
 * Returns `true` when a value is an `Result`.
 *
 * @since 4.0.0
 */

export const isResult = (u: unknown): u is AnyResult => hasProperty(u, TypeId)

/**
 * Returns `true` when a value is a `Result`. Alias of {@link isResult}.
 *
 * @since 4.0.0
 */
export const isAsyncResult = (u: unknown): u is AnyResult => isResult(u)

/**
 * Creates an `Initial` result, optionally marking it as waiting.
 *
 * @since 4.0.0
 */

export const initial = <A = never, E = never>(waiting = false): Initial<A, E> => {
  const result: Initial<A, E> = {
    ...ResultProto,
    ...InitialTag,
    waiting,
  }
  return result
}

type WaitingOptions = {
  readonly waiting?: boolean | undefined
}

type PreviousSuccessOptions<A, E> = {
  readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
}

const waitingFromDefined = (options: WaitingOptions): boolean => {
  if (options.waiting === undefined) {
    return false
  }
  return options.waiting
}

const waitingOption = (options: WaitingOptions | undefined): boolean => {
  if (options === undefined) {
    return false
  }
  return waitingFromDefined(options)
}

const previousSuccessFromDefined = <A, E>(
  options: PreviousSuccessOptions<A, E>,
): Option.Option<Success<A, E>> => {
  if (options.previousSuccess === undefined) {
    return Option.none()
  }
  return options.previousSuccess
}

const previousSuccessOption = <A, E>(
  options: PreviousSuccessOptions<A, E> | undefined,
): Option.Option<Success<A, E>> => {
  if (options === undefined) {
    return Option.none()
  }
  return previousSuccessFromDefined(options)
}

/**
 * @since 4.0.0
 */

export const successAt: {
  <A, E = never>(options: {
    readonly waiting?: boolean | undefined
    readonly timestamp: number
  }): (value: A) => Success<A, E>
  <A, E = never>(value: A, options: {
    readonly waiting?: boolean | undefined
    readonly timestamp: number
  }): Success<A, E>
} = dual(
  2,
  <A, E = never>(
    value: A,
    options: { readonly timestamp: number; readonly waiting?: boolean | undefined },
  ): Success<A, E> => {
    const result: Success<A, E> = {
      ...ResultProto,
      ...SuccessTag,
      value,
      waiting: waitingOption(options),
      timestamp: options.timestamp,
    }
    return result
  },
)

/**
 * Creates a `Failure` result from a `Cause`, optionally preserving a previous
 * success and marking the result as waiting.
 *
 * @since 4.0.0
 */

export const failure: {
  <A, E = never>(options?: {
    readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
    readonly waiting?: boolean | undefined
  }): (cause: Cause.Cause<E>) => Failure<A, E>
  <A, E = never>(
    cause: Cause.Cause<E>,
    options?: {
      readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E>
} = dual(
  (args) => Cause.isCause(args[0]),
  <A, E = never>(
    cause: Cause.Cause<E>,
    options?: {
      readonly previousSuccess?: Option.Option<Success<A, E>> | undefined
      readonly waiting?: boolean | undefined
    },
  ): Failure<A, E> => {
    const result: Failure<A, E> = {
      ...ResultProto,
      ...FailureTag,
      cause,
      previousSuccess: previousSuccessOption(options),
      waiting: waitingOption(options),
    }
    return result
  },
)

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

const markedWaiting = <A, E>(result: Result<A, E>): Result<A, E> =>
  result.waiting ? result : { ...result, waiting: true }

/**
 * Creates a waiting result from an optional previous result, using `Initial(true)` when no previous result exists.
 *
 * @since 4.0.0
 */

export const waitingFrom = <A, E>(previous: Option.Option<Result<A, E>>): Result<A, E> => {
  if (Option.isNone(previous)) {
    return initial(true)
  }
  return markedWaiting(previous.value)
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
      previousSuccess: Option.map(self.previousSuccess, (s) => successAt(f(s.value), s)),
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
    return successAt(f(self.value), self)
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

export type AllSuccess<Arg> = [Arg] extends [readonly Top[]] ? {
    -readonly [K in keyof Arg]: [Arg[K]] extends [Result<infer _A, infer _E>] ? _A : Arg[K]
  }
  : [Arg] extends [Iterable<infer _A>] ? _A extends Result<infer _AA, infer _E> ? _AA : _A
  : [Arg] extends [Record<string, Top>] ? {
      -readonly [K in keyof Arg]: [Arg[K]] extends [Result<infer _A, infer _E>] ? _A : Arg[K]
    }
  : never

export type AllError<Arg> = [Arg] extends [readonly Top[]] ? Result.Failure<Arg[number]>
  : [Arg] extends [Iterable<infer _A>] ? Result.Failure<_A>
  : [Arg] extends [Record<string, Top>] ? Result.Failure<Arg[keyof Arg]>
  : never

export const allAt: {
  (results: Iterable<Top> | Record<string, Top>, timestamp: number): AnyResult
  (timestamp: number): (results: Iterable<Top> | Record<string, Top>) => AnyResult
} = dual(
  2,
  (results: Iterable<Top> | Record<string, Top>, timestamp: number): AnyResult => allImpl(results, timestamp),
)

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

const finishArray = (state: AllArrayState, timestamp: number): AnyResult => {
  if (state.early !== undefined) {
    return state.early
  }
  return successAt(state.successes, { timestamp, waiting: state.waiting })
}

const allIterable = <T = unknown>(results: Iterable<T>, timestamp: number): AnyResult => {
  const state: AllArrayState = { waiting: false, early: undefined, successes: [] }
  for (const result of results) {
    collectIntoArray(state, result)
  }
  return finishArray(state, timestamp)
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

const finishRecord = (state: AllRecordState, timestamp: number): AnyResult => {
  if (state.early !== undefined) {
    return state.early
  }
  return successAt(state.successes, { timestamp, waiting: state.waiting })
}

const allRecord = <T = unknown>(results: Record<string, T>, timestamp: number): AnyResult => {
  const state: AllRecordState = { waiting: false, early: undefined, successes: {} }
  for (const [key, result] of Object.entries(results)) {
    collectIntoRecord(state, key, result)
  }
  return finishRecord(state, timestamp)
}

const allImpl = <T = unknown>(results: Iterable<T> | Record<string, T>, timestamp: number): AnyResult => {
  if (isIterable(results)) {
    return allIterable(results, timestamp)
  }
  return allRecord(results, timestamp)
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

/**
 * Schema interface for `Result` values, retaining the schemas used for
 * success values and failure errors.
 *
 * @since 4.0.0
 */

export interface Schema<
  Success extends Schema_.Constraint,
  Error extends Schema_.Constraint,
> extends
  Schema_.declareConstructor<
    Result<(Success | typeof Schema_.Never)['Type'], (Error | typeof Schema_.Never)['Type']>,
    Result<(Success | typeof Schema_.Never)['Encoded'], (Error | typeof Schema_.Never)['Encoded']>,
    readonly [Success | typeof Schema_.Never, Schema_.Cause<Error | typeof Schema_.Never, Schema_.Defect>]
  >
{
  readonly success: Success | typeof Schema_.Never
  readonly error: Error | typeof Schema_.Never
}

const schemaOrNever = <A extends Schema_.Constraint>(
  schema: A | undefined,
): A | typeof Schema_.Never => {
  if (schema === undefined) {
    return Schema_.Never
  }
  return schema
}

const isSuccessResult = <A, E>(result: Result<A, E>): result is Success<A, E> => hasProperty(result, 'value')

const isFailureResult = <A, E>(result: Result<A, E>): result is Failure<A, E> => hasProperty(result, 'cause')

type AnyFailure<A = unknown, E = unknown> = Failure<A, E>

/**
 * Creates a schema for `Result` values using optional schemas for success values and failure errors.
 *
 * @since 4.0.0
 */

export const Schema = <
  A extends Schema_.Constraint = typeof Schema_.Never,
  E extends Schema_.Constraint = typeof Schema_.Never,
>(
  options: {
    readonly success?: A | undefined
    readonly error?: E | undefined
  },
): Schema<A, E> => {
  const success_ = schemaOrNever(options.success)
  const error_ = schemaOrNever(options.error)
  const schema = Schema_.declareConstructor<
    Result<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>,
    Result<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>
  >()(
    [success_, Schema_.Cause(error_, Schema_.Defect())],
    ([value, cause]) => (input, ast, options) => {
      const parseFailureKnown = (failed: AnyFailure) => {
        const prevSuccessEffect = failed.previousSuccess.pipe(
          Option.map((ps) =>
            Effect.mapBothEager(
              SchemaParser.decodeUnknownEffect(value)(ps.value, options),
              {
                onSuccess: (value) => Option.some(successAt(value, ps)),
                onFailure: (issue) =>
                  new SchemaIssue.Composite(
                    ast,
                    [
                      new SchemaIssue.Pointer(['previousSuccess', 'value'], issue),
                    ],
                    input,
                    options,
                  ),
              },
            )
          ),
          Option.getOrElse(() => Effect.succeedNone),
        )
        const causeEffect = Effect.mapErrorEager(
          SchemaParser.decodeUnknownEffect(cause)(failed.cause, options),
          (issue) => new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['cause'], issue)], input, options),
        )
        return Effect.flatMapEager(
          prevSuccessEffect,
          (previousSuccess) =>
            Effect.mapEager(causeEffect, (cause) =>
              failure(cause, {
                previousSuccess,
                waiting: failed.waiting,
              })),
        )
      }

      const parseSuccessOrInitial = (known: AnyResult) => {
        if (isSuccessResult(known)) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(value)(known.value, options),
            {
              onSuccess: (value) => successAt(value, known),
              onFailure: (issue) =>
                new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['value'], issue)], input, options),
            },
          )
        }
        return Effect.succeed(initial(known.waiting))
      }

      const parseKnown = (known: AnyResult) => {
        if (isFailureResult(known)) {
          return parseFailureKnown(known)
        }
        return parseSuccessOrInitial(known)
      }

      if (!isResult(input)) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      return parseKnown(input)
    },
    {
      expected: 'Result',
      toCodec([value, cause]) {
        const SuccessSchema = Schema_.TaggedStruct('Success', {
          value,
          waiting: Schema_.Boolean,
          timestamp: Schema_.Finite,
        })
        const encodedSchema = Schema_.Union([
          Schema_.TaggedStruct('Initial', { waiting: Schema_.Boolean }),
          SuccessSchema,
          Schema_.TaggedStruct('Failure', {
            cause,
            previousSuccess: Schema_.Option(SuccessSchema),
            waiting: Schema_.Boolean,
          }),
        ])
        return Schema_.link<
          Result<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>
        >()(
          encodedSchema,
          SchemaTransformation.transform({
            decode: (encoded) => {
              function decodeRest(rest: typeof encoded) {
                if (hasProperty(rest, 'cause')) {
                  return failure(rest.cause, {
                    previousSuccess: Option.map(rest.previousSuccess, (ps) => successAt(ps.value, ps)),
                    waiting: rest.waiting,
                  })
                }
                return initial<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>(
                  rest.waiting,
                )
              }
              if (hasProperty(encoded, 'value')) {
                return successAt(encoded.value, { waiting: encoded.waiting, timestamp: encoded.timestamp })
              }
              return decodeRest(encoded)
            },
            encode(result): (typeof encodedSchema)['Type'] {
              function encodeRest(rest: typeof result): (typeof encodedSchema)['Type'] {
                if (hasProperty(rest, 'cause')) {
                  return {
                    _tag: 'Failure',
                    cause: rest.cause,
                    previousSuccess: rest.previousSuccess,
                    waiting: rest.waiting,
                  }
                }
                return { _tag: 'Initial', waiting: rest.waiting }
              }
              if (hasProperty(result, 'value')) {
                return {
                  _tag: 'Success',
                  value: result.value,
                  waiting: result.waiting,
                  timestamp: result.timestamp,
                }
              }
              return encodeRest(result)
            },
          }),
        )
      },
      toEquivalence: Equal.asEquivalence,
      // Native arbitrary compiles Declaration via toCodecArbitrary. The previous
      // `toArbitrary` constructed `Initial`; keep that constructor, now as a
      // Schema link, until Cause/Defect generation is a real encoded subset.
      toCodecArbitrary: () =>
        Schema_.link<
          Result<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>
        >()(
          Schema_.TaggedStruct('Initial', { waiting: Schema_.Boolean }),
          {
            decode: SchemaGetter.transform((encoded) =>
              initial<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>(
                encoded.waiting,
              )
            ),
            encode: SchemaGetter.transform((result) => ({
              _tag: 'Initial' as const,
              waiting: result.waiting,
            })),
          },
        ),
      toFormatter: ([value, cause]) => (t) => {
        function formatRest(rest: typeof t) {
          if (hasProperty(rest, 'cause')) {
            return `Result.Failure(${cause(rest.cause)}, ${rest.waiting})`
          }
          return `Result.Initial(${rest.waiting})`
        }
        if (hasProperty(t, 'value')) {
          return `Result.Success(${value(t.value)}, ${t.waiting}, ${t.timestamp})`
        }
        return formatRest(t)
      },
    },
  )
  return Object.assign(schema, {
    success: success_,
    error: error_,
  })
}

/**
 * A codec for `Result` values built from the given success and error schemas.
 */

export const schemaCodec: {
  (error: Schema_.Top): (success: Schema_.Top) => Schema<Schema_.Top, Schema_.Top>
  (success: Schema_.Top, error: Schema_.Top): Schema<Schema_.Top, Schema_.Top>
} = dual(
  2,
  (success: Schema_.Top, error: Schema_.Top): Schema<Schema_.Top, Schema_.Top> => Schema({ success, error }),
)

export const ResultSchema: Schema<typeof Schema_.Finite, typeof Schema_.String> = Schema({
  success: Schema_.Finite,
  error: Schema_.String,
})
