import { Schema } from 'effect'

/**
 * The tri-state outcome of judging one input against one pattern. These are the classes the
 * pattern-evaluation resource code constructs (KD7) — never inside a `Workflow.make` body —
 * and the run-policy cell serialises them into `SelectCase` command data.
 *
 * A matched or missed verdict has nothing to explain; only an uncertain one names why it
 * could not be decided, so the reason lives on that variant alone.
 */
export const PatternMatched = Schema.TaggedStruct('Match', {})
export type PatternMatched = typeof PatternMatched.Type

export const PatternMissed = Schema.TaggedStruct('Miss', {})
export type PatternMissed = typeof PatternMissed.Type

export const PatternUncertain = Schema.TaggedStruct('Uncertain', {
  reason: Schema.String,
})
export type PatternUncertain = typeof PatternUncertain.Type

/** The verdict union pattern evaluation returns for one case. */
export const PatternResult = Schema.Union([PatternMatched, PatternMissed, PatternUncertain]).pipe(
  Schema.toTaggedUnion('_tag'),
)
export type PatternResult = typeof PatternResult.Type

/** The dispatch-relevant part of a verdict: which of the three ways it resolved. */
export type PatternStatus = PatternResult['_tag']

/**
 * The status literal on its own, for commands and traces that carry the resolution without
 * the whole verdict. Annotated with the type derived from {@link PatternResult}, so a drift
 * between this literal set and the verdict tags fails the compile.
 */
export const PatternStatus: Schema.Codec<PatternStatus> = Schema.Literals(['Match', 'Miss', 'Uncertain'])
