import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  DisagreedOnOrder,
  DisagreedOnSeeded,
  DisagreementAttempt,
  NoDisagreement,
  SelectDisagreementAttempt,
} from './select-disagreement-attempt.schema.js'

const judgedSeeded = (seededDisagrees: boolean): DisagreementAttempt =>
  Match.value(seededDisagrees).pipe(
    Match.when(true, () => DisagreedOnSeeded.make({})),
    Match.when(false, () => NoDisagreement.make({})),
    Match.exhaustive,
  )

export const selectDisagreementAttempt = Workflow.make({
  command: SelectDisagreementAttempt,
  decision: DisagreementAttempt,
  error: Schema.Never,
  decide: (command): Result.Result<DisagreementAttempt, never> =>
    Result.succeed(
      Match.value(command.orderDisagrees).pipe(
        Match.when(true, () => DisagreedOnOrder.make({})),
        Match.when(false, () => judgedSeeded(command.seededDisagrees)),
        Match.exhaustive,
      ),
    ),
})
