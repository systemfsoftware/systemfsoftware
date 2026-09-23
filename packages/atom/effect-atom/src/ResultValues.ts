/**
 * Value-side declarations backing the `Result` module.
 *
 * These declarations were lifted out of `Result.ts` to break the import cycle
 * between `Result.ts` and `internal/result-schema.ts`. Both modules now import
 * from this leaf, so the dependency graph becomes:
 *
 *   result-values.ts (this file)  <--  Result.ts
 *                                  <--  internal/result-schema.ts
 *
 * The public surface is unchanged: every public name declared here is
 * re-exported from `Result.ts`. `ResultProto` stays leaf-internal and is
 * reached directly by `Result.ts` and by the constructors in this file.
 */
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import { dual, identity } from 'effect/Function'
import * as Hash from 'effect/Hash'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'
import { hasProperty } from 'effect/Predicate'

const now = () => Effect.runSync(Clock.currentTimeMillis)

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
export const ResultProto = {
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

type TimestampOptions = {
  readonly timestamp?: number | undefined
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

type SuccessOptions = WaitingOptions & TimestampOptions

/**
 * @since 4.0.0
 */
export const success = <A, E = never>(value: A): Success<A, E> => successWith(value, {})

/**
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
  <A, E = never>(value: A, options: SuccessOptions): Success<A, E> => {
    const result: Success<A, E> = {
      ...ResultProto,
      ...SuccessTag,
      value,
      waiting: waitingOption(options),
      timestamp: timestampOption(options),
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
