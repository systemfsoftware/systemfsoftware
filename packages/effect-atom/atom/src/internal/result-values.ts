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
import * as Equal from 'effect/Equal'
import { identity } from 'effect/Function'
import * as Hash from 'effect/Hash'
import { hasProperty } from 'effect/Predicate'

import * as Option from 'effect/Option'
import { type Pipeable, pipeArguments } from 'effect/Pipeable'

import * as Cause from 'effect/Cause'

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
 * Represents the state of an asynchronous value as `Initial`, `Success`, or
 * `Failure`, with a `waiting` flag for in-flight refreshes.
 *
 * @category models
 * @since 4.0.0
 */
export type Result<A, E = never> = Initial<A, E> | Success<A, E> | Failure<A, E>

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
 * Initial `Result` state before a success value or failure cause is available.
 *
 * @category models
 * @since 4.0.0
 */
export interface Initial<A, E = never> extends Result.Proto<A, E> {
  readonly _tag: 'Initial'
}

/**
 * Successful `Result` containing the current value, its timestamp, and the
 * shared waiting flag.
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
 * Failed `Result` containing a failure cause and the latest previous success
 * when one is available.
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
 * Returns `true` when a value is an `Result`.
 *
 * @category guards
 * @since 4.0.0
 */
export const isResult = (u: unknown): u is Result<unknown, unknown> => hasProperty(u, TypeId)

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
 * Creates a `Success` result with a value and optional `waiting` flag or
 * timestamp override.
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
 * Creates a `Failure` result from a `Cause`, optionally preserving a previous
 * success and marking the result as waiting.
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
