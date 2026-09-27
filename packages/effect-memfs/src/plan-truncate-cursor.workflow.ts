import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { CursorClamped, CursorKept, PlanTruncateCursor, TruncateCursorDecision } from './plan-truncate-cursor.schema.js'

export const planTruncateCursor = Workflow.make({
  command: PlanTruncateCursor,
  decision: TruncateCursorDecision,
  error: Schema.Never,
  decide: (command): Result.Result<TruncateCursorDecision, never> => {
    const end = BigInt(command.length)
    return Match.value(command.position > end).pipe(
      Match.when(true, () => Result.succeed(new CursorClamped({ position: end }))),
      Match.when(false, () => Result.succeed(new CursorKept({ position: command.position }))),
      Match.exhaustive,
    )
  },
})
