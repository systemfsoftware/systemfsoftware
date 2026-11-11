/**
 * The compile-time half of the refusal kernel: what a body's yields require of the run, and the gate that turns a
 * body with no check into an error at the test name.
 *
 * A library whose steps are not Effects yields {@link Handle}s: a branded value that is not an Effect, so the
 * union of a body's yields cannot collapse to the widest `Effect`, and `yield*` of an `Effect.sleep` is not a
 * handle. The handle's requirement is read here exactly as an Effect's is.
 *
 * @since 4.1.0
 */
import type * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import type * as Types from 'effect/Types'
import type { Asserted } from './checks.js'
import type { ForkGateTexts, GateTexts } from './refusals.js'

type Opaque<A = unknown> = A

/** @internal */
export const HandleTypeId: unique symbol = Symbol.for('@systemfsoftware/vitest/Handle')

/** @internal */
export type HandleTypeId = typeof HandleTypeId

/** @internal */
export interface Handle<A, R = never> {
  readonly [HandleTypeId]: { readonly _A: Types.Covariant<A>; readonly _R: Types.Covariant<R> }
  [Symbol.iterator](): Iterator<Handle<A, R>, A, A>
}

const variance = { _A: (_: never) => _, _R: (_: never) => _ }

/** @internal */
export const makeHandle = <A, R = never, P extends object = Record<never, never>>(payload: P): Handle<A, R> & P => {
  const handle: Handle<A, R> & P = {
    ...payload,
    [HandleTypeId]: variance,
    *[Symbol.iterator](): Iterator<Handle<A, R>, A, A> {
      return yield handle
    },
  }
  return handle
}

/** @internal */
export const isHandle = (value: unknown): value is Handle<Opaque, Opaque> => Predicate.hasProperty(value, HandleTypeId)

interface Handled<R> {
  readonly [HandleTypeId]: { readonly _R: Types.Covariant<R> }
}

/** @internal */
export type Unresolved<Eff, Sentinel = unknown> = [Eff] extends [never] ? false
  : [Sentinel] extends [Eff] ? true
  : false

/**
 * The requirement a body's yields impose on the run, read from Effects and from {@link Handle}s alike.
 *
 * While a body is still being inferred — and always, for a body whose `{ expect }` is destructured without an
 * annotation — `Eff` stands at the checker's placeholder, and this reads that placeholder as the checks' own
 * requirement. The body's real yields decide once inference settles.
 *
 * @internal
 */
export type RequirementOf<Eff> = [Eff] extends [never] ? never
  : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R
  : [Eff] extends [Handled<infer R>] ? R
  : Unresolved<Eff> extends true ? Asserted
  : never

/**
 * The no-check gate, on the test name. It reads the tuple form so a distributive `Exclude` cannot widen `R`, and
 * it sits on the name rather than the body because a body with a destructured `{ expect }` is context-sensitive:
 * a gate on the body is judged before `{ expect }` is inferred, so it cannot see the checks.
 *
 * @internal
 */
export type Gate<R, Provided = never, Texts extends GateTexts = ForkGateTexts> = [R] extends [Asserted | Provided]
  ? [Asserted] extends [R] ? string : Texts['noCheck']
  : Texts['unprovided']

/** @internal */
export type BodyRefusal<Texts extends GateTexts = ForkGateTexts> =
  | Texts['syncBody']
  | Texts['asyncBody']
  | Texts['effectBody']
