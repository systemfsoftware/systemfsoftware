import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Verdict } from './Verdict.schema.js'

const NegateRelationVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/NegateRelationVerdict')
type NegateRelationVerdictTypeId = typeof NegateRelationVerdictTypeId

export class HoldNegated extends Schema.TaggedClass<HoldNegated>()('HoldNegated', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
}) {
  readonly [NegateRelationVerdictTypeId] = NegateRelationVerdictTypeId
}

export class BreakNegated extends Schema.TaggedClass<BreakNegated>()('BreakNegated', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
}) {
  readonly [NegateRelationVerdictTypeId] = NegateRelationVerdictTypeId
}

export const NegateRelationVerdictDecision = Schema.Union([HoldNegated, BreakNegated])
export type NegateRelationVerdictDecision = typeof NegateRelationVerdictDecision.Type

export class NegateRelationVerdict extends Schema.TaggedClass<NegateRelationVerdict>()('NegateRelationVerdict', {
  conjunct: Schema.String,
  verdict: Verdict,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decide = (command: NegateRelationVerdict): Result.Result<NegateRelationVerdictDecision, never> =>
  Result.succeed(
    Match.value(command.verdict).pipe(
      Match.tag('Hold', (held) =>
        new HoldNegated({
          conjunct: command.conjunct,
          inspected: held.inspected,
          detail: `${held.conjunct} held`,
        })),
      Match.tag('Break', (breach) => new BreakNegated({ conjunct: command.conjunct, inspected: breach.inspected })),
      Match.exhaustive,
    ),
  )

export const negateRelationVerdict = Workflow.make({
  command: NegateRelationVerdict,
  decision: NegateRelationVerdictDecision,
  error: Schema.Never,
  decide,
})
