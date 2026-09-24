import { it } from '@effect/vitest'
import { Array as Arr, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { type EligibilityDecision, EligibilityQuestion, selectEligibility } from '../select-eligibility.workflow.js'

const idsOf = (ids: ReadonlyArray<string>): string => Arr.join(ids, ',')

const decidedOf = (membership: ReadonlyArray<string>, candidates: ReadonlyArray<string>): EligibilityDecision =>
  Result.match(selectEligibility(new EligibilityQuestion({ membership, candidates })), {
    onFailure: (impossible) => impossible,
    onSuccess: (decided) => decided,
  })

const isNoCandidateOf = (decided: EligibilityDecision, membership: ReadonlyArray<string>): boolean =>
  Match.value(decided).pipe(
    Match.tag('NoCandidateEligible', (none) => idsOf(none.membership) === idsOf(membership)),
    Match.orElse(() => false),
  )

const isSingleCandidateOf = (decided: EligibilityDecision, candidate: string): boolean =>
  Match.value(decided).pipe(
    Match.tag('SingleCandidateEligible', (single) => single.candidate === candidate),
    Match.orElse(() => false),
  )

const isDistributionOf = (decided: EligibilityDecision, candidates: ReadonlyArray<string>): boolean =>
  Match.value(decided).pipe(
    Match.tag('CandidateDistribution', (distribution) => idsOf(distribution.candidates) === idsOf(candidates)),
    Match.orElse(() => false),
  )

it.prop(
  '∀c_NoCandidates_=NoCandidateEligible',
  [Schema.Array(Schema.String)],
  ([membership]) => isNoCandidateOf(decidedOf(membership, []), membership),
)

it.prop(
  '∀c_OneCandidate_=SingleCandidateEligible',
  [Schema.String],
  ([candidate]) => isSingleCandidateOf(decidedOf([candidate], [candidate]), candidate),
)

it.prop(
  '∀c_TwoOrMoreCandidates_=DistributionInOfferOrder',
  [Schema.String, Schema.String, Schema.Array(Schema.String)],
  ([first, second, rest]) => {
    const candidates = [first, second, ...rest]
    return isDistributionOf(decidedOf(candidates, candidates), candidates)
  },
)

it.prop(
  '∀c_CandidateCount_=TotalNeverRefuses',
  [Schema.Array(Schema.String)],
  ([candidates]) =>
    Match.value(decidedOf(candidates, candidates)).pipe(
      Match.tag('NoCandidateEligible', () => true),
      Match.tag('SingleCandidateEligible', () => true),
      Match.tag('CandidateDistribution', () => true),
      Match.orElse(() => false),
    ),
)
