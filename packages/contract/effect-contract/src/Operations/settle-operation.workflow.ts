import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { AlreadySettled, OperationState, Settled, SettlementAnswer } from './operation-state.schema.js'

export class SettleOperation extends Schema.TaggedClass<SettleOperation>()('SettleOperation', {
  state: OperationState,
  answer: SettlementAnswer,
  settledAt: Schema.DateTimeUtc,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const answerEquivalence = Schema.toEquivalence(SettlementAnswer)

const decideSettlement = (command: SettleOperation): Result.Result<Settled, AlreadySettled> =>
  Match.value(command.state).pipe(
    Match.tag('Pending', () => Result.succeed(new Settled({ answer: command.answer, settledAt: command.settledAt }))),
    Match.tag('Settled', (settled) =>
      Match.value(answerEquivalence(settled.answer, command.answer)).pipe(
        Match.when(true, () => Result.succeed(settled)),
        Match.when(false, () => Result.fail(new AlreadySettled({ state: settled, answer: command.answer }))),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const settleOperation = Workflow.make({
  command: SettleOperation,
  decision: Settled,
  error: AlreadySettled,
  decide: decideSettlement,
})
