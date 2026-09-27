import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ReadExhausted, ReadPartial, ReadSlice, ReadSliceDecision, ReadWhole } from './plan-read-slice.schema.js'

export const planReadSlice = Workflow.make({
  command: ReadSlice,
  decision: ReadSliceDecision,
  error: Schema.Never,
  decide: (command): Result.Result<ReadSliceDecision, never> =>
    Match.value(command.bytesRead === 0).pipe(
      Match.when(true, () => Result.succeed(new ReadExhausted())),
      Match.when(false, () =>
        Match.value(command.bytesRead >= command.requested).pipe(
          Match.when(true, () => Result.succeed(new ReadWhole())),
          Match.when(false, () => Result.succeed(new ReadPartial({ bytesRead: command.bytesRead }))),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
})
