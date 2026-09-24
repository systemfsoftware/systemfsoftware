/**
 * @internal The R13 law kinds: `model`, `metamorphic`, `roundTrip` and `invariant` are sugar over the
 * gated property (R11/R12); `idempotent` and `deterministic` are declared exempt — they skip the impostor
 * gate, are reported as exempt, and are the only exemptions.
 *
 * Each kind owns the comparison, so there is nowhere to write `return true`: the author hands over
 * functions, and the kind relates their outputs with Effect's structural `Equal`.
 */
import * as Equal from 'effect/Equal'
import type { ElementValues, Gens, PropertySpec, Values } from './engine.js'
import { NonTupleOf } from './error.schema.js'

/** @internal */
export type LawKind = 'model' | 'metamorphic' | 'roundTrip' | 'invariant' | 'idempotent' | 'deterministic'

/** @internal */
export type ExemptKind = 'idempotent' | 'deterministic'

/** @internal */
export const isExemptKind = (kind: LawKind): kind is ExemptKind => kind === 'idempotent' || kind === 'deterministic'

/**
 * A subject of a law kind: a function of the generated values.
 *
 * @internal
 */
export type LawSubject<G extends Gens, A> = (...values: ReadonlyArray<ElementValues<G>>) => A

/**
 * A metamorphic relation: the input transform, and how the two outputs relate (structural equality by default).
 *
 * @internal
 */
export interface MetamorphicRelation<G extends Gens, A> {
  readonly transform: (...values: ReadonlyArray<ElementValues<G>>) => Values<G>
  readonly relate?: (original: A, transformed: A) => boolean
}

/**
 * The R13 law surface: four gated kinds and two declared exemptions.
 *
 * @internal
 */
export interface LawApi {
  readonly model: <const G extends Gens, A, N extends number, S extends LawSubject<G, A>>(
    name: string,
    spec: PropertySpec<G, S, N>,
    oracle: LawSubject<G, A>,
  ) => void
  readonly metamorphic: <const G extends Gens, A, N extends number, S extends LawSubject<G, A>>(
    name: string,
    spec: PropertySpec<G, S, N>,
    relation: MetamorphicRelation<G, A>,
  ) => void
  readonly roundTrip: <const G extends Gens, E, N extends number, S extends LawSubject<G, E>>(
    name: string,
    spec: PropertySpec<G, S, N>,
    decode: (encoded: E) => Values<G>,
  ) => void
  readonly invariant: <const G extends Gens, A, N extends number, S extends LawSubject<G, A>>(
    name: string,
    spec: PropertySpec<G, S, N>,
    holds: (output: A, ...values: ReadonlyArray<ElementValues<G>>) => boolean,
  ) => void
  readonly idempotent: <
    const G extends Gens,
    N extends number,
    S extends (value: ElementValues<G>) => ElementValues<G>,
  >(
    name: string,
    spec: PropertySpec<G, S, N>,
  ) => void
  readonly deterministic: <const G extends Gens, A, N extends number, S extends LawSubject<G, A>>(
    name: string,
    spec: PropertySpec<G, S, N>,
  ) => void
}

/**
 * The generated values as the argument list a law subject is called with.
 *
 * @internal
 */
export const spreadValues = <G extends Gens>(values: Values<G>): ReadonlyArray<ElementValues<G>> =>
  Array.isArray(values) ? values : refuseRecordOf()

const refuseRecordOf = (): never => {
  throw new NonTupleOf({
    detail: 'a law kind spreads the generated values into its subject, so `of` must be a tuple; ' +
      'a record `of` holds functions of the record, which only it.prop reaches',
  })
}

const call = <G extends Gens, A>(subject: LawSubject<G, A>, values: Values<G>): A => subject(...spreadValues(values))

const equalOutputs = <A>(original: A, transformed: A): boolean => Equal.equals(original, transformed)

/** @internal */
export const modelHolds = <G extends Gens, A>(
  oracle: LawSubject<G, A>,
): (subject: LawSubject<G, A>, values: Values<G>) => boolean =>
(subject, values) => Equal.equals(call(subject, values), call(oracle, values))

/** @internal */
export const metamorphicHolds = <G extends Gens, A>(
  relation: MetamorphicRelation<G, A>,
): (subject: LawSubject<G, A>, values: Values<G>) => boolean =>
(subject, values) =>
  (relation.relate ?? equalOutputs)(call(subject, values), call(subject, relation.transform(...spreadValues(values))))

/** @internal */
export const roundTripHolds = <G extends Gens, E>(
  decode: (encoded: E) => Values<G>,
): (subject: LawSubject<G, E>, values: Values<G>) => boolean =>
(subject, values) => Equal.equals(decode(call(subject, values)), values)

/** @internal */
export const invariantHolds = <G extends Gens, A>(
  holds: (output: A, ...values: ReadonlyArray<ElementValues<G>>) => boolean,
): (subject: LawSubject<G, A>, values: Values<G>) => boolean =>
(subject, values) => holds(call(subject, values), ...spreadValues(values))

const firstOf = <A>(values: ReadonlyArray<A>): A | undefined => values[0]

const sameTwice = <G extends Gens>(
  subject: (value: ElementValues<G>) => ElementValues<G>,
  value: ElementValues<G> | undefined,
): boolean => value === undefined ? false : Equal.equals(subject(subject(value)), subject(value))

/** @internal */
export const idempotentHolds = <G extends Gens>(): (
  subject: (value: ElementValues<G>) => ElementValues<G>,
  values: Values<G>,
) => boolean =>
(subject, values) => sameTwice(subject, firstOf(spreadValues(values)))

/** @internal */
export const deterministicHolds =
  <G extends Gens, A>(): (subject: LawSubject<G, A>, values: Values<G>) => boolean => (subject, values) =>
    Equal.equals(call(subject, values), call(subject, values))
