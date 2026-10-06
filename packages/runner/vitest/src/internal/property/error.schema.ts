/// <reference types="vitest/importMeta" />
/**
 * The closed set of property-channel failures (KTD1, R1): refuted, non-boolean, under-covered and self-model, plus
 * the vacuous impostor verdict, the seed store's read failure and a stale explicit replay. Every variant is a `Schema.TaggedError` carrying
 * its own data — the property it names, a rendered-and-projected witness, coverage classes, the law that refused
 * itself — and a zero-argument `message` getter computed only from those fields. Wording is free; nothing reads a
 * message back.
 *
 * @since 4.0.0
 */
import { Match, Option, Schema } from 'effect'

/**
 * A property's seed: a whole number a generator chose, never negative (CONST-D3).
 *
 * @internal
 */
export const PropertySeed = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('PropertySeed'),
)
/** @internal */
export type PropertySeed = typeof PropertySeed.Type

/**
 * The count of runs a property's check was configured with, never negative (CONST-D3).
 *
 * @internal
 */
export const PropertyRunCount = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('PropertyRunCount'),
)
/** @internal */
export type PropertyRunCount = typeof PropertyRunCount.Type

/** @internal */
export const PropertyShrinkCount = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('PropertyShrinkCount'),
)
/** @internal */
export type PropertyShrinkCount = typeof PropertyShrinkCount.Type

/**
 * One witness: the text the renderer prints for a value, and a JSON-safe projection of the same traversal (R3, KD7).
 *
 * @internal
 */
export const Witness = Schema.Struct({
  rendered: Schema.String,
  value: Schema.Json,
})
/** @internal */
export type Witness = typeof Witness.Type

/**
 * One property involved in a failure: its full name, its declaration site, its seed and its run count (R2).
 *
 * @internal
 */
export const PropertyRun = Schema.Struct({
  name: Schema.String,
  site: Schema.NullOr(Schema.String),
  seed: PropertySeed,
  runs: PropertyRunCount,
})
/** @internal */
export type PropertyRun = typeof PropertyRun.Type

/**
 * The kinds a non-boolean verdict can be: every `typeof` result, plus an `Effect` on the sync lane (R4).
 *
 * @internal
 */
export const VerdictKind = Schema.Literals([
  'undefined',
  'object',
  'boolean',
  'number',
  'bigint',
  'string',
  'symbol',
  'function',
  'effect',
])
/** @internal */
export type VerdictKind = typeof VerdictKind.Type

/**
 * A falsified property: the property that ran, the shrunk counterexample the generator settled on, and how many
 * shrink steps it took to reach it (R2-R4).
 *
 * @internal
 */
export class PropertyRefuted extends Schema.TaggedError<PropertyRefuted>()('PropertyRefuted', {
  property: PropertyRun,
  counterexample: Witness,
  shrinks: PropertyShrinkCount,
  replay: Schema.String,
}) {
  override get message(): string {
    return `${this.property.name}: the property was falsified within ${String(this.property.runs)} run(s), and ` +
      `${String(this.shrinks)} shrink(s) settled on its input. Shrunk input: ${this.counterexample.rendered}`
  }
}

/**
 * A verdict that was not a literal boolean: the property that ran, the first drawn values whose verdict was not a
 * boolean, and every kind of value the property returned (R4).
 *
 * @internal
 */
export class NonBooleanVerdict extends Schema.TaggedError<NonBooleanVerdict>()('NonBooleanVerdict', {
  property: PropertyRun,
  drawn: Witness,
  returned: Schema.Array(VerdictKind),
  replay: Schema.String,
}) {
  override get message(): string {
    return `${this.property.name}: the property returned no boolean; it returned ${this.returned.join(', ')}. ` +
      'A property must return a literal boolean verdict — asserting with expect(), or returning an Option, ' +
      'Result or object, is not a verdict.'
  }
}

/**
 * One coverage class left under its minimum: its label, hits, runs and required share (R7).
 *
 * @internal
 */
export const CoverageClassFailure = Schema.Struct({
  label: Schema.String,
  hits: Schema.Int,
  runs: Schema.Int,
  minimum: Schema.Finite,
})
/** @internal */
export type CoverageClassFailure = typeof CoverageClassFailure.Type

/**
 * A property whose declared coverage classes stayed under their minima: the property and the failed classes, in
 * declaration order (R7).
 *
 * @internal
 */
export class CoverageBelowMinimum extends Schema.TaggedError<CoverageBelowMinimum>()('CoverageBelowMinimum', {
  property: PropertyRun,
  classes: Schema.Array(CoverageClassFailure),
  replay: Schema.String,
}) {
  override get message(): string {
    const lines = this.classes.map((entry) =>
      `coverage ${entry.label}: ${entry.hits}/${entry.runs} of runs, below the required ${entry.minimum}`
    )
    return `${this.property.name}: ${lines.join('\n')}`
  }
}

/**
 * A model law given the subject itself as its oracle, so it compares nothing (R13).
 *
 * @internal
 */
export class SelfModelLaw extends Schema.TaggedError<SelfModelLaw>()('SelfModelLaw', {
  name: Schema.String,
  site: Schema.NullOr(Schema.String),
}) {
  override get message(): string {
    return `${this.name}: the model is the subject itself; a model law must compare against an independent oracle.`
  }
}

/**
 * A seed-store line that could not be decoded (R16, KTD6).
 *
 * @internal
 */
export class SeedStoreUnreadable extends Schema.TaggedError<SeedStoreUnreadable>()('SeedStoreUnreadable', {
  file: Schema.String,
  line: Schema.Int,
  detail: Schema.String,
}) {
  override get message(): string {
    return `the seed store ${this.file} line ${this.line} could not be read: ${this.detail}`
  }
}

/**
 * What a subject's constant impostor froze for one property: each frozen key — the subject itself, or a record
 * member — with the value its first call returned (R4, R6). Empty when the property never called the subject.
 *
 * @internal
 */
export const FrozenOutput = Schema.Struct({
  member: Schema.String,
  output: Witness,
})
/** @internal */
export type FrozenOutput = typeof FrozenOutput.Type

/**
 * The impostor's frozen outputs (R4).
 *
 * @internal
 */
export const Frozen = Schema.TaggedStruct('Frozen', {
  outputs: Schema.Array(FrozenOutput),
})
/** @internal */
export type Frozen = typeof Frozen.Type

/**
 * A property whose body never called the subject during the vacuity check: nothing was frozen (R6).
 *
 * @internal
 */
export const NeverCalled = Schema.TaggedStruct('NeverCalled', {})
/** @internal */
export type NeverCalled = typeof NeverCalled.Type

/**
 * One non-refuting property of a vacuous subject: the property it ran, and whether the impostor was called (R5).
 *
 * @internal
 */
export const VacuousPropertyRun = Schema.Struct({
  property: PropertyRun,
  frozen: Schema.Union([Frozen, NeverCalled]),
})
/** @internal */
export type VacuousPropertyRun = typeof VacuousPropertyRun.Type

/**
 * One vacuous subject: what it is, and every non-refuting property in the file that ran over it (R5).
 *
 * @internal
 */
export const VacuousSubject = Schema.Struct({
  label: Schema.String,
  properties: Schema.Array(VacuousPropertyRun),
})
/** @internal */
export type VacuousSubject = typeof VacuousSubject.Type

/**
 * A law kind exempt from the impostor gate in a refused file: its name and the kind that exempted it (R6).
 *
 * @internal
 */
export const ExemptLaw = Schema.Struct({
  name: Schema.String,
  kind: Schema.String,
})
/** @internal */
export type ExemptLaw = typeof ExemptLaw.Type

const REPAIR_ADVICE = 'Laws that only relate outputs to each other (additivity, idempotence, commutativity, ' +
  'round trips through the subject) hold for such constants. Pin the output to the input: compare against an ' +
  'independent model (`subject(x)` equals a straightforward reimplementation), or conjoin a base case ' +
  '(`subject([one])` equals its known value). Also check that the body calls the `subject` it was given, not ' +
  'the imported implementation.'

const fakeTextOf = (run: VacuousPropertyRun): ReadonlyArray<string> =>
  Match.value(run.frozen).pipe(
    Match.tag('Frozen', (frozen) =>
      frozen.outputs.map((entry) => `${entry.member} always returned ${entry.output.rendered}`)),
    Match.tag('NeverCalled', (): ReadonlyArray<string> => []),
    Match.exhaustive,
  )

const subjectMessageOf = (subject: VacuousSubject): string => {
  const names = subject.properties.map((run) => run.property.name).join(', ')
  const runs = subject.properties.reduce((total, run) => total + run.property.runs, 0)
  const fakes = subject.properties.flatMap(fakeTextOf)
  const fake = fakes.length === 0 ? 'was never called' : fakes.join('; ')
  return `${names}: no property in this file refuted the constant impostor of this subject ` +
    `(${subject.label}), so nothing here pins it down. It held for ${String(runs)} run(s) against a fake that ` +
    `${fake}, whatever the input. ${REPAIR_ADVICE}`
}

/**
 * Thrown at file end when no property in the file refuted a subject's constant impostor (R12, R5, R6).
 *
 * @internal
 */
export class VacuousProperty extends Schema.TaggedError<VacuousProperty>()('VacuousProperty', {
  subjects: Schema.Array(VacuousSubject),
  exempt: Schema.Array(ExemptLaw),
  replay: Schema.String,
}) {
  override get message(): string {
    return this.subjects.map(subjectMessageOf).join('\n\n')
  }
}

/** @internal */
export class ReplayUnreadable extends Schema.TaggedError<ReplayUnreadable>()('ReplayUnreadable', {
  text: Schema.String,
}) {
  override get message(): string {
    return `CONFORMANCE_REPLAY names neither a seed and path nor a property entry: ${this.text}`
  }
}

/**
 * An explicit `CONFORMANCE_REPLAY` replay whose recorded failure no longer reproduces: after the root re-check,
 * the replay still mismatched, so no draw reproduces the failure the text names. The recorded seed-store path is
 * not this — there the entry is one candidate among the novel draws, and only a draw that still fails refutes.
 *
 * @internal
 */
export class ReplayNoLongerReproduces extends Schema.TaggedError<ReplayNoLongerReproduces>()(
  'ReplayNoLongerReproduces',
  {
    property: PropertyRun,
    replay: Schema.String,
  },
) {
  override get message(): string {
    return `${this.property.name}: the CONFORMANCE_REPLAY replay ${this.replay} no longer reproduces a failure ` +
      'for this property; the case it named is gone or its generator changed.'
  }
}

/**
 * Thrown when a law kind is given a record `of`, which cannot be spread into its subject.
 *
 * @internal
 */
export class NonTupleOf extends Schema.TaggedError<NonTupleOf>()('NonTupleOf', {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}

/** The recorded numbers a property's seed or run count must refuse: a negative and a non-integer (CONST-D3). */
const REFUSED_WHOLE_NUMBERS: ReadonlyArray<number> = [-1, 1.5]

/** The domain rule both refinements restate: a property's seed and run count are whole and never negative. */
const nonNegativeInteger = (value: number): boolean => Number.isInteger(value) && value >= 0

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  const acceptsSeed = (value: number): boolean => Option.isSome(Schema.decodeOption(PropertySeed)(value))
  const acceptsRunCount = (value: number): boolean => Option.isSome(Schema.decodeOption(PropertyRunCount)(value))

  const agreesAtBoundaries = (accepts: (value: number) => boolean, value: number): boolean =>
    [...REFUSED_WHOLE_NUMBERS, value].every((candidate) => accepts(candidate) === nonNegativeInteger(candidate))

  it.prop(
    '∀n_PropertySeedRefusal_≡NonNegativeInteger',
    { of: [Schema.Int], subject: { accepts: acceptsSeed } },
    (seed, [value]) => agreesAtBoundaries(seed.accepts, value),
  )

  it.prop(
    '∀n_PropertyRunCountRefusal_≡NonNegativeInteger',
    { of: [Schema.Int], subject: { accepts: acceptsRunCount } },
    (runCount, [value]) => agreesAtBoundaries(runCount.accepts, value),
  )
}
