import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  Agreed,
  DisagreedByFailureFingerprint,
  DisagreedByOutput,
  DualExitJudgement,
  JudgeDualExits,
} from './judge-dual-exits.schema.js'

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
