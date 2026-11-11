/**
 * The compile-time half of the refusal kernel: what a body's yields require of the run, and the gate that turns a
 * body with no check into an error at the test name.
 *
 * A library whose steps are not Effects yields {@link Handle}s: a branded value that is not an Effect, so the
 * union of a body's yields cannot collapse to the widest `Effect`, and `yield*` of an `Effect.sleep` is not a
 * handle. A handle carries the Effect it runs and takes its requirement from that Effect, so only a step built
 * on a check carries `Asserted`.
 *
 * @since 4.1.0
 */
import type * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import type * as Types from 'effect/Types'
import type { Asserted } from './checks.js'
import type { ForkGateTexts, GateTexts } from './refusals.js'

type Opaque<A = unknown> = A

export const HandleTypeId: unique symbol = Symbol.for('@systemfsoftware/vitest/Handle')

export type HandleTypeId = typeof HandleTypeId

export interface Handle<A, R = never> {
  readonly [HandleTypeId]: { readonly _A: Types.Covariant<A>; readonly _R: Types.Covariant<R> }
  [Symbol.iterator](): Iterator<Handle<A, R>, A, A>
}

export interface Stepped<A, R> {
  readonly effect: Effect.Effect<A, never, R>
}

const variance = { _A: (_: never) => _, _R: (_: never) => _ }

export const makeHandle = <A, R, P extends object = Record<never, never>>(
  payload: P & Stepped<A, R>,
): Handle<A, R> & P & Stepped<A, R> => {
  const handle: Handle<A, R> & P & Stepped<A, R> = {
    ...payload,
    [HandleTypeId]: variance,
    *[Symbol.iterator](): Iterator<Handle<A, R>, A, A> {
      return yield handle
    },
  }
  return handle
}

export const isHandle = (value: Opaque): value is Handle<Opaque, Opaque> => Predicate.hasProperty(value, HandleTypeId)

interface Handled<R> {
  readonly [HandleTypeId]: { readonly _R: Types.Covariant<R> }
}

export type Unresolved<Eff, Sentinel = unknown> = [Eff] extends [never] ? false
  : [Sentinel] extends [Eff] ? true
  : false

/**
 * The requirement a fork body's yields impose on the run, read from Effects only: a body that yields nothing but
 * {@link Handle}s is not one the fork's `it` accepts.
 *
 * While a body is still being inferred — and always, for a body whose `{ expect }` is destructured without an
 * annotation — `Eff` stands at the checker's placeholder, and this reads that placeholder as the checks' own
 * requirement. The body's real yields decide once inference settles.
 */
export type ForkRequirementOf<Eff> = [Eff] extends [never] ? never
  : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R
  : Unresolved<Eff> extends true ? Asserted
  : never

/** The requirement a body's yields impose on the run, read from Effects and from {@link Handle}s alike. */
export type RequirementOf<Eff> = [Eff] extends [never] ? never
  : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R
  : [Eff] extends [Handled<infer R>] ? R
  : Unresolved<Eff> extends true ? Asserted
  : never

type Literal<Text extends string> = string extends Text ? never : Text

/**
 * The no-check gate, on the test name. It reads the tuple form so a distributive `Exclude` cannot widen `R`, and
 * it sits on the name rather than the body because a body with a destructured `{ expect }` is context-sensitive:
 * a gate on the body is judged before `{ expect }` is inferred, so it cannot see the checks.
 *
 * A refusal is a literal text: texts typed as plain `string` leave no name that compiles.
 */
export type Gate<R, Provided = never, Texts extends GateTexts = ForkGateTexts> = [R] extends [Asserted | Provided]
  ? [Asserted] extends [R] ? string : Literal<Texts['noCheck']>
  : Literal<Texts['unprovided']>

export type BodyRefusal<Texts extends GateTexts = ForkGateTexts> =
  | Literal<Texts['syncBody']>
  | Literal<Texts['asyncBody']>
  | Literal<Texts['effectBody']>
