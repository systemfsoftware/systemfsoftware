import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { BudgetLimit } from './Budget.schema.js'

const BudgetChargeTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/BudgetCharge')
type BudgetChargeTypeId = typeof BudgetChargeTypeId

export class ChargeAdmitted extends Schema.TaggedClass<ChargeAdmitted>()('ChargeAdmitted', {
  decisions: Schema.Finite,
}) {
  readonly [BudgetChargeTypeId] = BudgetChargeTypeId
}

export class BudgetExhausted extends Schema.TaggedError<BudgetExhausted>()('BudgetExhausted', {
  reason: Schema.String,
  spentDecisions: Schema.Finite,
  spentCalls: Schema.Finite,
  requestedDecisions: Schema.Finite,
  maxDecisions: BudgetLimit,
  maxCalls: BudgetLimit,
}) {
  override get message(): string {
    return `Budget exhausted after ${this.spentDecisions} decisions and ${this.spentCalls} calls: ${this.reason}`
  }
}

export class AdmitBudgetCharge extends Schema.TaggedClass<AdmitBudgetCharge>()('AdmitBudgetCharge', {
  spentDecisions: Schema.Finite,
  spentCalls: Schema.Finite,
  requestedDecisions: Schema.Finite,
  maxDecisions: BudgetLimit,
  maxCalls: BudgetLimit,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    requestedDecisions: 'app.discern.requested_decisions',
  } as const
}

const EXHAUSTED_REASON = 'Discern budget exhausted'

const overDecisions = (command: AdmitBudgetCharge): boolean =>
  Match.value(command.maxDecisions).pipe(
    Match.tag('Unlimited', () => false),
    Match.tag('Limited', (limited) => command.spentDecisions + command.requestedDecisions > limited.count),
    Match.exhaustive,
  )

const overCalls = (command: AdmitBudgetCharge): boolean =>
  Match.value(command.maxCalls).pipe(
    Match.tag('Unlimited', () => false),
    Match.tag('Limited', (limited) => command.spentCalls + 1 > limited.count),
    Match.exhaustive,
  )

const refusalOf = (command: AdmitBudgetCharge): BudgetExhausted =>
  new BudgetExhausted({
    reason: EXHAUSTED_REASON,
    spentDecisions: command.spentDecisions,
    spentCalls: command.spentCalls,
    requestedDecisions: command.requestedDecisions,
    maxDecisions: command.maxDecisions,
    maxCalls: command.maxCalls,
  })

const settleCalls = (command: AdmitBudgetCharge): Result.Result<ChargeAdmitted, BudgetExhausted> =>
  Match.value(overCalls(command)).pipe(
    Match.when(true, () => Result.fail(refusalOf(command))),
    Match.when(false, () => Result.succeed(new ChargeAdmitted({ decisions: command.requestedDecisions }))),
    Match.exhaustive,
  )

const decideCharge = (command: AdmitBudgetCharge): Result.Result<ChargeAdmitted, BudgetExhausted> =>
  Match.value(overDecisions(command)).pipe(
    Match.when(true, () => Result.fail(refusalOf(command))),
    Match.when(false, () => settleCalls(command)),
    Match.exhaustive,
  )

export const admitBudgetCharge = Workflow.make({
  command: AdmitBudgetCharge,
  decision: ChargeAdmitted,
  error: BudgetExhausted,
  decide: decideCharge,
})
