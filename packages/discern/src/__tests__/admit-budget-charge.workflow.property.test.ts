import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import {
  AdmitBudgetCharge,
  admitBudgetCharge,
  BudgetExhausted,
  ChargeAdmitted,
} from '../admit-budget-charge.workflow.js'

type Verdict = Result.Result<ChargeAdmitted, BudgetExhausted>

const tagOf = (verdict: Verdict): string =>
  Result.match(verdict, {
    onSuccess: (admitted) => admitted._tag,
    onFailure: (refused) => refused._tag,
  })

const withinLimits = (command: AdmitBudgetCharge): boolean =>
  Option.match(Option.fromUndefinedOr(command.maxDecisions), {
    onNone: () => true,
    onSome: (max) => command.spentDecisions + command.requestedDecisions <= max,
  }) &&
  Option.match(Option.fromUndefinedOr(command.maxCalls), {
    onNone: () => true,
    onSome: (max) => command.spentCalls + 1 <= max,
  })

it.prop(
  '∀c_AdmitCharge_=ChargeAdmitted',
  { of: [Schema.Int, Schema.Int], subject: admitBudgetCharge },
  (subject, [spentDecisions, requestedDecisions]) =>
    tagOf(subject(new AdmitBudgetCharge({ spentDecisions, spentCalls: 0, requestedDecisions }))) === 'ChargeAdmitted',
)

it.prop(
  '∀c_AdmitCharge_=BudgetExhausted',
  { of: [Schema.Int, Schema.Int], subject: admitBudgetCharge },
  (subject, [spentDecisions, requestedDecisions]) =>
    tagOf(
      subject(
        new AdmitBudgetCharge({
          spentDecisions,
          spentCalls: 0,
          requestedDecisions,
          maxDecisions: spentDecisions + requestedDecisions - 1,
        }),
      ),
    ) === 'BudgetExhausted',
)

it.prop(
  '∀c_ChargeAdmitted_⊆Limits',
  { of: [AdmitBudgetCharge], subject: admitBudgetCharge },
  (subject, [command]) => Result.isFailure(subject(command)) || withinLimits(command),
)
