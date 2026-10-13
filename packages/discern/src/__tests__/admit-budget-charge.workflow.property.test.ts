import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  AdmitBudgetCharge,
  admitBudgetCharge,
  BudgetExhausted,
  ChargeAdmitted,
} from '../admit-budget-charge.workflow.js'
import { Limited, Unlimited } from '../Budget.schema.js'

type Verdict = Result.Result<ChargeAdmitted, BudgetExhausted>

const tagOf = (verdict: Verdict): string =>
  Result.match(verdict, {
    onSuccess: (admitted) => admitted._tag,
    onFailure: (refused) => refused._tag,
  })

it.prop(
  '∀c_AdmitCharge_=ChargeAdmitted',
  { of: [Schema.Int, Schema.Int], subject: admitBudgetCharge },
  (subject, [spentDecisions, requestedDecisions]) =>
    tagOf(
      subject(
        new AdmitBudgetCharge({
          spentDecisions,
          spentCalls: 0,
          requestedDecisions,
          maxDecisions: Unlimited.make({}),
          maxCalls: Unlimited.make({}),
        }),
      ),
    ) === 'ChargeAdmitted',
)

it.prop(
  '∀c_AdmitCharge_=BudgetExhausted',
  {
    of: [
      Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
      Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
    ],
    subject: admitBudgetCharge,
  },
  (subject, [spentDecisions, requestedDecisions]) =>
    tagOf(
      subject(
        new AdmitBudgetCharge({
          spentDecisions,
          spentCalls: 0,
          requestedDecisions,
          maxDecisions: Limited.make({ count: spentDecisions + requestedDecisions - 1 }),
          maxCalls: Unlimited.make({}),
        }),
      ),
    ) === 'BudgetExhausted',
)

it.prop(
  '∀c_Admission_=TracksItsLimit',
  {
    of: [
      Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
      Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
    ],
    subject: admitBudgetCharge,
  },
  (subject, [spentDecisions, requestedDecisions]) => {
    const unbounded = new AdmitBudgetCharge({
      spentDecisions,
      spentCalls: 0,
      requestedDecisions,
      maxDecisions: Unlimited.make({}),
      maxCalls: Unlimited.make({}),
    })
    const noCalls = new AdmitBudgetCharge({
      spentDecisions,
      spentCalls: 0,
      requestedDecisions,
      maxDecisions: Unlimited.make({}),
      maxCalls: Limited.make({ count: 0 }),
    })
    return tagOf(subject(unbounded)) === 'ChargeAdmitted' && tagOf(subject(noCalls)) === 'BudgetExhausted'
  },
)
