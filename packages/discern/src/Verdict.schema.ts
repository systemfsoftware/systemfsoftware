import { Array as Arr, Match, Option, Schema } from 'effect'
import { dual, identity } from 'effect/Function'

/**
 * The tri-state outcome of judging one input against one pattern. A matched or missed
 * verdict has nothing to explain; only an uncertain one names why it could not be decided,
 * so the reason lives on that variant alone.
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

/** A `Match` verdict. */
export const matched = (): PatternResult => PatternMatched.make({})

/** A `Miss` verdict. */
export const missed = (): PatternResult => PatternMissed.make({})

/** An `Uncertain` verdict, naming why it could not be decided. */
export const uncertain = (reason: string): PatternResult => PatternUncertain.make({ reason })

/** The status literal of a verdict, read through `Match` rather than the tag. */
export const statusOf = (result: PatternResult): PatternStatus =>
  Match.value(result).pipe(
    Match.tag('Match', () => 'Match' as const),
    Match.tag('Miss', () => 'Miss' as const),
    Match.tag('Uncertain', () => 'Uncertain' as const),
    Match.exhaustive,
  )

/** The reason an uncertain verdict carries; a decided verdict has none. */
export const reasonOf = (result: PatternResult): string | undefined =>
  Match.value(result).pipe(
    Match.tag('Match', () => undefined),
    Match.tag('Miss', () => undefined),
    Match.tag('Uncertain', (found) => found.reason),
    Match.exhaustive,
  )

const isStatus = (status: PatternStatus): (result: PatternResult) => boolean => {
  const is = (result: PatternResult): boolean => statusOf(result) === status
  return is
}

/** Whether a possibly-absent resolution carries the given status. */
export const statusIs: {
  (status: PatternStatus): (resolved: PatternResult | undefined) => boolean
  (resolved: PatternResult | undefined, status: PatternStatus): boolean
} = dual(
  2,
  (resolved: PatternResult | undefined, status: PatternStatus): boolean =>
    Option.match(Option.fromNullishOr(resolved), {
      onNone: () => false,
      onSome: isStatus(status),
    }),
)

const isMiss = isStatus('Miss')

const isUncertain = isStatus('Uncertain')

/** Kleene AND over verdicts: `Miss` dominates; otherwise `Uncertain` dominates. */
export const andResult = (results: ReadonlyArray<PatternResult>): PatternResult =>
  Option.match(Arr.findFirst(results, isMiss), {
    onSome: identity,
    onNone: () => Option.getOrElse(Arr.findFirst(results, isUncertain), matched),
  })

/** Kleene OR over verdicts: `Match` dominates; otherwise `Uncertain` dominates. */
export const orResult = (results: ReadonlyArray<PatternResult>): PatternResult =>
  Option.match(Arr.findFirst(results, isStatus('Match')), {
    onSome: identity,
    onNone: () => Option.getOrElse(Arr.findFirst(results, isUncertain), missed),
  })
