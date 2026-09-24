import { it } from '@effect/vitest'
import { Array as Arr, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { type EligibilityDecision, EligibilityQuestion, selectEligibility } from '../select-eligibility.workflow.js'

const idsOf = (ids: ReadonlyArray<string>): string => Arr.join(ids, ',')

type Select = typeof selectEligibility

const decidedOf = (
  select: Select,
  membership: ReadonlyArray<string>,
  candidates: ReadonlyArray<string>,
): EligibilityDecision =>
  Result.match(select(new EligibilityQuestion({ membership, candidates })), {
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

const isTotalOf = (decided: EligibilityDecision, candidates: ReadonlyArray<string>): boolean =>
  Match.value(decided).pipe(
    Match.tag(
      'NoCandidateEligible',
      (none) => Arr.length(candidates) === 0 && idsOf(none.membership) === idsOf(candidates),
    ),
    Match.tag(
      'SingleCandidateEligible',
      (single) => Arr.length(candidates) === 1 && single.candidate === candidates[0],
    ),
    Match.tag(
      'CandidateDistribution',
      (distribution) => Arr.length(candidates) >= 2 && idsOf(distribution.candidates) === idsOf(candidates),
    ),
    Match.exhaustive,
  )

it.prop(
  '∀c_NoCandidates_=NoCandidateEligible',
  { of: [Schema.Array(Schema.String)], subject: selectEligibility },
  (subject, [membership]) => isNoCandidateOf(decidedOf(subject, membership, []), membership),
)

it.prop(
  '∀c_OneCandidate_=SingleCandidateEligible',
  { of: [Schema.String], subject: selectEligibility },
  (subject, [candidate]) => isSingleCandidateOf(decidedOf(subject, [candidate], [candidate]), candidate),
)

it.prop(
  '∀c_TwoOrMoreCandidates_=DistributionInOfferOrder',
  { of: [Schema.String, Schema.String, Schema.Array(Schema.String)], subject: selectEligibility },
  (subject, [first, second, rest]) => {
    const candidates = [first, second, ...rest]
    return isDistributionOf(decidedOf(subject, candidates, candidates), candidates)
  },
)

it.prop(
  '∀c_CandidateCount_=TotalNeverRefuses',
  { of: [Schema.Array(Schema.String)], subject: selectEligibility },
  (subject, [candidates]) => isTotalOf(decidedOf(subject, candidates, candidates), candidates),
)
