import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { CommandRefused } from './Command.fixture.js'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Decision')
type DecisionTypeId = typeof DecisionTypeId

export class TaggedCmd extends S.TaggedClass<TaggedCmd>()('TaggedCmd', {
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { value: 'tests.command.value' } as const
}

export class DecisionOne extends S.TaggedClass<DecisionOne>()('DecisionOne', {
  value: S.Int,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class DecisionTwo extends S.TaggedClass<DecisionTwo>()('DecisionTwo', {
  reason: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const Decision = S.Union([DecisionOne, DecisionTwo])

export const acceptTaggedCommand = Workflow.make({
  command: TaggedCmd,
  decision: Decision,
  error: CommandRefused,
  decide: (command: TaggedCmd): Result.Result<DecisionOne | DecisionTwo, CommandRefused> =>
    Match.value(command.value === 0).pipe(
      Match.when(true, () => Result.succeed(new DecisionTwo({ reason: 'zero' }))),
      Match.when(false, () => Result.succeed(new DecisionOne({ value: command.value }))),
      Match.exhaustive,
    ),
})
