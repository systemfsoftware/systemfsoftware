import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { TaggedCmd } from './accept-tagged-command.workflow.js'
import { CommandRefused } from './Command.fixture.js'

/**
 * The no-leak proof. A decider may widen its own parameter to a supertype —
 * ordinary contravariance — and the published command channel must still be the
 * class, not `unknown`. This was the bypass most likely to reopen the original
 * hole, so the type test asserts the resulting channel rather than merely
 * accepting the call.
 */
const WidenedDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-cell-types/tests/WidenedCommand/Decision',
)
type WidenedDecisionTypeId = typeof WidenedDecisionTypeId

export class WidenedOne extends S.TaggedClass<WidenedOne>()('WidenedOne', {
  value: S.Int,
}) {
  readonly [WidenedDecisionTypeId] = WidenedDecisionTypeId
}

export class WidenedTwo extends S.TaggedClass<WidenedTwo>()('WidenedTwo', {
  reason: S.String,
}) {
  readonly [WidenedDecisionTypeId] = WidenedDecisionTypeId
}

export const WidenedDecision = S.Union([WidenedOne, WidenedTwo])

export const refuseWidenedCommand = Workflow.make({
  command: TaggedCmd,
  decision: WidenedDecision,
  error: CommandRefused,
  decide: <Cmd = unknown>(_command: Cmd): Result.Result<WidenedOne | WidenedTwo, CommandRefused> => {
    const cmd = _command as TaggedCmd
    return Match.value(cmd).pipe(
      Match.when({ value: 0 }, () => Result.succeed(new WidenedTwo({ reason: 'zero' }))),
      Match.orElse(() => Result.succeed(new WidenedOne({ value: 0 }))),
    )
  },
})
