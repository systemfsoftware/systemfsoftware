import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { CommandRefused, TaggedCmd } from './Command.schema.js'

const WidenedDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-cell-types/tests/WidenedCommand/Decision',
)

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

export type WidenedDecision = WidenedOne | WidenedTwo

export const decideWidened = Workflow.make(
  TaggedCmd,
  (_command: unknown): Result.Result<WidenedDecision, CommandRefused> =>
    Match.value(_command).pipe(
      Match.when({ value: 0 }, () => Result.succeed(new WidenedTwo({ reason: 'zero' }))),
      Match.orElse(() => Result.succeed(new WidenedOne({ value: 0 }))),
    ),
)
