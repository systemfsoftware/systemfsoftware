import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'

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
  maxDecisions: Schema.optional(Schema.Finite),
  maxCalls: Schema.optional(Schema.Finite),
}) {}

export class AdmitBudgetCharge extends Schema.TaggedClass<AdmitBudgetCharge>()('AdmitBudgetCharge', {
  spentDecisions: Schema.Finite,
  spentCalls: Schema.Finite,
  requestedDecisions: Schema.Finite,
  maxDecisions: Schema.optional(Schema.Finite),
  maxCalls: Schema.optional(Schema.Finite),
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    requestedDecisions: 'app.discern.requested_decisions',
  } as const
}

const EXHAUSTED_REASON = 'Discern budget exhausted'

const overDecisions = (command: AdmitBudgetCharge): boolean =>
  Option.match(Option.fromUndefinedOr(command.maxDecisions), {
    onNone: () => false,
    onSome: (max) => command.spentDecisions + command.requestedDecisions > max,
  })

const overCalls = (command: AdmitBudgetCharge): boolean =>
  Option.match(Option.fromUndefinedOr(command.maxCalls), {
    onNone: () => false,
    onSome: (max) => command.spentCalls + 1 > max,
  })

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
