import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const DualExitJudgementTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/differential-spec/DualExitJudgement',
)
type DualExitJudgementTypeId = typeof DualExitJudgementTypeId

export class Agreed extends Schema.TaggedClass<Agreed>()('Agreed', {}) {
  readonly [DualExitJudgementTypeId] = DualExitJudgementTypeId
}

export class DisagreedByOutput extends Schema.TaggedClass<DisagreedByOutput>()('DisagreedByOutput', {}) {
  readonly [DualExitJudgementTypeId] = DualExitJudgementTypeId
}

export class DisagreedByFailureFingerprint extends Schema.TaggedClass<DisagreedByFailureFingerprint>()(
  'DisagreedByFailureFingerprint',
  {},
) {
  readonly [DualExitJudgementTypeId] = DualExitJudgementTypeId
}

export const DualExitJudgement = Schema.Union([Agreed, DisagreedByOutput, DisagreedByFailureFingerprint])
export type DualExitJudgement = typeof DualExitJudgement.Type

export class JudgeDualExits extends Schema.TaggedClass<JudgeDualExits>()('JudgeDualExits', {
  bothSucceeded: Schema.Boolean,
  oracleHeld: Schema.Boolean,
  failuresMatch: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
