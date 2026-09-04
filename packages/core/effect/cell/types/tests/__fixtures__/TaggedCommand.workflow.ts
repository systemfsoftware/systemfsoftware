import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { CommandRefused, TaggedCmd } from './Command.schema.js'

const FixtureDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-cell-types/tests/TaggedCommand/Decision',
)

export class DecisionOne extends S.TaggedClass<DecisionOne>()('DecisionOne', {
  value: S.Int,
}) {
  readonly [FixtureDecisionTypeId] = FixtureDecisionTypeId
}

export class DecisionTwo extends S.TaggedClass<DecisionTwo>()('DecisionTwo', {
  reason: S.String,
}) {
  readonly [FixtureDecisionTypeId] = FixtureDecisionTypeId
}

export type FixtureDecision = DecisionOne | DecisionTwo

export const decideTagged = Workflow.make(
  TaggedCmd,
  (command: TaggedCmd): Result.Result<FixtureDecision, CommandRefused> =>
    Match.value(command.value === 0).pipe(
      Match.when(true, () => Result.succeed(new DecisionTwo({ reason: 'zero' }))),
      Match.when(false, () => Result.succeed(new DecisionOne({ value: command.value }))),
      Match.exhaustive,
    ),
)
