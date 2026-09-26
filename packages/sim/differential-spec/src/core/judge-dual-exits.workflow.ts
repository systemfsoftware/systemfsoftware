import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

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

const whenBothSucceeded = (oracleHeld: boolean): DualExitJudgement =>
  Match.value(oracleHeld).pipe(
    Match.when(true, () => new Agreed({})),
    Match.when(false, () => new DisagreedByOutput({})),
    Match.exhaustive,
  )

const whenNotBothSucceeded = (failuresMatch: boolean): DualExitJudgement =>
  Match.value(failuresMatch).pipe(
    Match.when(true, () => new Agreed({})),
    Match.when(false, () => new DisagreedByFailureFingerprint({})),
    Match.exhaustive,
  )

export const judgeDualExits = Workflow.make({
  command: JudgeDualExits,
  decision: DualExitJudgement,
  error: Schema.Never,
  decide: (command): Result.Result<DualExitJudgement, never> =>
    Result.succeed(
      Match.value(command.bothSucceeded).pipe(
        Match.when(true, () => whenBothSucceeded(command.oracleHeld)),
        Match.when(false, () => whenNotBothSucceeded(command.failuresMatch)),
        Match.exhaustive,
      ),
    ),
})
