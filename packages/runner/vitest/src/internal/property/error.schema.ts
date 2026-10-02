/// <reference types="vitest/importMeta" />
/**
 * The closed set of property-channel failures (KTD1, R1): refuted, non-boolean, under-covered and self-model, plus
 * the vacuous impostor verdict and the seed store's read failure. Every variant is a `Schema.TaggedError` carrying
 * its own data — the property it names, a rendered-and-projected witness, coverage classes, the law that refused
 * itself — and a zero-argument `message` getter computed only from those fields. Wording is free; nothing reads a
 * message back.
 *
 * @since 4.0.0
 */
import { Option, Schema } from 'effect'

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
 * The generator's choice that refuted a property, as data: the seed and the shrink path fast-check recorded.
 *
 * @internal
 */
export const PropertyReplay = Schema.Struct({
  seed: Schema.Finite,
  path: Schema.Array(Schema.Finite),
})

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
  replay: Schema.optional(PropertyReplay),
}) {
  override get message(): string {
    return `${this.property.name}: the property was falsified after ${String(this.property.runs)} run(s) and ` +
      `${String(this.shrinks)} shrink(s). Shrunk input: ${this.counterexample.rendered}`
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
 * Thrown at file end when no property in the file refuted a subject's constant impostor (R12).
 *
 * @internal
 */
export class VacuousProperty extends Schema.TaggedError<VacuousProperty>()('VacuousProperty', {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
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
