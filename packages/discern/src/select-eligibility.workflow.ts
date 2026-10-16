import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const EligibilityDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/EligibilityDecision')
type EligibilityDecisionTypeId = typeof EligibilityDecisionTypeId

export class EligibilityQuestion extends Schema.TaggedClass<EligibilityQuestion>()('EligibilityQuestion', {
  membership: Schema.Array(Schema.String),
  candidates: Schema.Array(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class NoCandidateEligible extends Schema.TaggedClass<NoCandidateEligible>()('NoCandidateEligible', {
  membership: Schema.Array(Schema.String),
}) {
  readonly [EligibilityDecisionTypeId] = EligibilityDecisionTypeId
}

export class SingleCandidateEligible extends Schema.TaggedClass<SingleCandidateEligible>()('SingleCandidateEligible', {
  candidate: Schema.String,
}) {
  readonly [EligibilityDecisionTypeId] = EligibilityDecisionTypeId
}

export class CandidateDistribution extends Schema.TaggedClass<CandidateDistribution>()('CandidateDistribution', {
  candidates: Schema.TupleWithRest(Schema.Tuple([Schema.String, Schema.String]), [Schema.String]),
}) {
  readonly [EligibilityDecisionTypeId] = EligibilityDecisionTypeId
}

export const EligibilityDecision = Schema.Union([NoCandidateEligible, SingleCandidateEligible, CandidateDistribution])
export type EligibilityDecision = typeof EligibilityDecision.Type

const decideEligibility = (command: EligibilityQuestion): Result.Result<EligibilityDecision, never> =>
  Match.value(Arr.head(command.candidates)).pipe(
    Match.tag('None', () => Result.succeed(new NoCandidateEligible({ membership: command.membership }))),
    Match.tag('Some', (first) =>
      Match.value(Arr.head(Arr.drop(command.candidates, 1))).pipe(
        Match.tag('None', () => Result.succeed(new SingleCandidateEligible({ candidate: first.value }))),
        Match.tag('Some', (second) =>
          Result.succeed(
            new CandidateDistribution({
              candidates: [first.value, second.value, ...Arr.drop(command.candidates, 2)],
            }),
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const selectEligibility = Workflow.make({
  command: EligibilityQuestion,
  decision: EligibilityDecision,
  error: Schema.Never,
  decide: decideEligibility,
})
