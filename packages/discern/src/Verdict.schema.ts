import { Schema } from 'effect'

/**
 * The tri-state outcome of judging one input against one pattern. These are the classes the
 * pattern-evaluation resource code constructs (KD7) — never inside a `Workflow.make` body —
 * and the run-policy cell serialises them into `SelectCase` command data.
 */
export class PatternMatched extends Schema.TaggedClass<PatternMatched>()('Match', {
  reason: Schema.optional(Schema.String),
}) {}

export class PatternMissed extends Schema.TaggedClass<PatternMissed>()('Miss', {
  reason: Schema.optional(Schema.String),
}) {}

export class PatternUncertain extends Schema.TaggedClass<PatternUncertain>()('Uncertain', {
  reason: Schema.optional(Schema.String),
}) {}

/** The verdict union pattern evaluation returns for one case. */
export const PatternResult = Schema.Union([PatternMatched, PatternMissed, PatternUncertain])
export type PatternResult = typeof PatternResult.Type

/** The dispatch-relevant part of a verdict: which of the three ways it resolved. */
export type PatternStatus = PatternResult['_tag']

/**
 * The status literal on its own, for commands and traces that carry the resolution without
 * the whole verdict. Annotated with the type derived from {@link PatternResult}, so a drift
 * between this literal set and the verdict tags fails the compile.
 */
export const PatternStatus: Schema.Codec<PatternStatus> = Schema.Literals(['Match', 'Miss', 'Uncertain'])
