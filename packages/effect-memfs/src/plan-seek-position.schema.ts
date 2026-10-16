import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const SeekPositionDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/SeekPositionDecision',
)
type SeekPositionDecisionTypeId = typeof SeekPositionDecisionTypeId

export class SeekMoved extends Schema.TaggedClass<SeekMoved>()('SeekMoved', {
  position: Schema.BigInt,
}) {
  readonly [SeekPositionDecisionTypeId] = SeekPositionDecisionTypeId
}

export class SeekRefused extends Schema.TaggedClass<SeekRefused>()('SeekRefused', {
  position: Schema.BigInt,
}) {
  readonly [SeekPositionDecisionTypeId] = SeekPositionDecisionTypeId
}

export const SeekPositionDecision = Schema.Union([SeekMoved, SeekRefused])
export type SeekPositionDecision = typeof SeekPositionDecision.Type

export class PlanSeekPosition extends Schema.TaggedClass<PlanSeekPosition>()('PlanSeekPosition', {
  position: Schema.BigInt,
  offset: Schema.BigInt,
  from: Schema.Literals(['start', 'current']),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
