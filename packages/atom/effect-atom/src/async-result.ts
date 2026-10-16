/**
 * Clock-reading entry points for the `Result` model.
 *
 * The type, its schema codec, and every pure operation live in
 * `./async-result.schema.js`. The operations here read the clock to default a
 * `Success` timestamp: they compute the timestamp and delegate to the schema
 * file's pure constructors, so the pure core stays free of clock reads. Every
 * public name is re-exported so the `AsyncResult` namespace is unchanged.
 *
 * @since 4.0.0
 */
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import { allAt, failure, failureWithPrevious, isResult, isSuccess, successAt } from './async-result.schema.js'
import type { AllError, AllSuccess, Failure, Result, Success } from './async-result.schema.js'

export type { Builder, Defect, Failure, Initial, Interrupt, Result, Success, With } from './async-result.schema.js'
export {
  builder,
  cause,
  error,
  fail,
  failure,
  failureWithPrevious,
  failWith,
  failWithPrevious,
  flatMap,
  getOrElse,
  getOrThrow,
  initial,
  isAsyncResult,
  isFailure,
  isInitial,
  isInterrupted,
  isNotInitial,
  isResult,
  isSuccess,
  isWaiting,
  map,
  match,
  matchWithError,
  matchWithWaiting,
  replacePrevious,
  Schema,
  schemaCodec,
  toExit,
  TypeId,
  value,
  waitingFrom,
} from './async-result.schema.js'

type Top<A = unknown> = A

type AnyResult<A = unknown, E = unknown> = Result<A, E>

type TimestampOptions = {
  readonly timestamp?: number | undefined
}

const now = (): number => Effect.runSync(Effect.clockWith((clock) => clock.currentTimeMillis))

const timestampFromDefined = (options: TimestampOptions): number => {
  if (options.timestamp === undefined) {
    return now()
  }
  return options.timestamp
}

const timestampOption = (options: TimestampOptions | undefined): number => {
  if (options === undefined) {
    return now()
  }
  return timestampFromDefined(options)
}

/**
 * @since 4.0.0
 */
export const success = <A, E = never>(value: A): Success<A, E> => successWith(value, {})

/**
 * Creates a `Success` result, defaulting its timestamp to the current time when the options omit one.
 *
 * @since 4.0.0
 */
export const successWith: {
  <A, E = never>(options: {
    readonly waiting?: boolean | undefined
    readonly timestamp?: number | undefined
  }): (value: A) => Success<A, E>
  <A, E = never>(value: A, options: {
    readonly waiting?: boolean | undefined
    readonly timestamp?: number | undefined
  }): Success<A, E>
} = dual(
  2,
  <A, E = never>(value: A, options: TimestampOptions & { readonly waiting?: boolean | undefined }): Success<A, E> =>
    successAt(value, { waiting: options.waiting ?? false, timestamp: timestampOption(options) }),
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
    return { ...result, timestamp: now() }
  }
  return result
}

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
 * Combines an iterable or record of `Result` and plain values into one `Result`, returning the first non-success result or a success of the collected values marked waiting when any input success is waiting.
 *
 * @since 4.0.0
 */
export function all<const Arg extends Iterable<Top> | Record<string, Top>>(
  results: Arg,
): Result<AllSuccess<Arg>, AllError<Arg>>
export function all<T = unknown>(results: Iterable<T> | Record<string, T>): AnyResult {
  return allAt(results, now())
}
