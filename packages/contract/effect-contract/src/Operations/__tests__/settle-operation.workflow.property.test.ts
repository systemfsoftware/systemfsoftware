import { it } from '@systemfsoftware/vitest'
import { Boolean as Bool, DateTime, Match, Result, Schema } from 'effect'
import { AlreadySettled, OperationState, Settled, SettlementAnswer } from '../operation-state.schema.js'
import { SettleOperation, settleOperation } from '../settle-operation.workflow.js'

const settlementTable = {
  'Pending:false': 'SettledWithIncoming',
  'Pending:true': 'SettledWithIncoming',
  'Settled:true': 'ExistingSettled',
  'Settled:false': 'AlreadySettled',
} as const

type SettlementRule = 'SettledWithIncoming' | 'ExistingSettled' | 'AlreadySettled'

const ruleOf = (prior: 'Pending' | 'Settled', same: boolean): SettlementRule => settlementTable[`${prior}:${same}`]

const sameAnswer = (state: OperationState, answer: SettlementAnswer): boolean =>
  Match.value(state).pipe(
    Match.tag('Pending', () => false),
    Match.tag('Settled', (settled) => Schema.toEquivalence(SettlementAnswer)(settled.answer, answer)),
    Match.exhaustive,
  )

const holdsDecision = (
  outcome: SettlementRule,
  settled: Settled,
  state: OperationState,
  answer: SettlementAnswer,
  settledAt: DateTime.Utc,
): boolean =>
  Match.value(outcome).pipe(
    Match.when('SettledWithIncoming', () =>
      Bool.every([
        Schema.toEquivalence(SettlementAnswer)(settled.answer, answer),
        settled.settledAt === settledAt,
      ])),
    Match.when('ExistingSettled', () =>
      Match.value(state).pipe(
        Match.tag('Settled', (existing) => Schema.toEquivalence(Settled)(settled, existing)),
        Match.tag('Pending', () => false),
        Match.exhaustive,
      )),
    Match.when('AlreadySettled', () => false),
    Match.exhaustive,
  )

const verdict = (
  settle: typeof settleOperation,
  state: OperationState,
  answer: SettlementAnswer,
  settledAt: DateTime.Utc,
): boolean => {
  const outcome = ruleOf(state._tag, sameAnswer(state, answer))
  return Result.match(settle(new SettleOperation({ state, answer, settledAt })), {
    onFailure: (error) => Bool.every([outcome === 'AlreadySettled', Schema.is(AlreadySettled)(error)]),
    onSuccess: (settled) => holdsDecision(outcome, settled, state, answer, settledAt),
  })
}

it.prop(
  '∀x_SettleOperation_≡SettlementTable',
  { of: [OperationState, SettlementAnswer, Schema.DateTimeUtc], subject: settleOperation },
  (settle, [state, answer, settledAt]) => verdict(settle, state, answer, settledAt),
)

it.prop(
  '∀x_SettleOperationPrior_≡SettlementTable',
  { of: [Settled, SettlementAnswer, Schema.DateTimeUtc], subject: settleOperation },
  (settle, [settled, answer, settledAt]) => {
    const same = Schema.toEquivalence(SettlementAnswer)(settled.answer, answer)
    return Result.match(settle(new SettleOperation({ state: settled, answer, settledAt })), {
      onFailure: (error) => Bool.every([same === false, Schema.is(AlreadySettled)(error)]),
      onSuccess: (existing) => Bool.every([same === true, Schema.toEquivalence(Settled)(existing, settled)]),
    })
  },
)
