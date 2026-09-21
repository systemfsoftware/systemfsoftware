import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { CreditAccount, CustomerTier } from './credit.schema.js'

const CreditDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/CreditCheckDecision',
)
type CreditDecisionTypeId = typeof CreditDecisionTypeId

const CreditErrorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/CreditCheckError',
)
type CreditErrorTypeId = typeof CreditErrorTypeId

const CreditAmount = S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0)))

export class CreditGranted extends S.TaggedClass<CreditGranted>()('CreditGranted', {
  orderId: S.String,
  overdraftAmount: CreditAmount,
}) {
  readonly [CreditDecisionTypeId] = CreditDecisionTypeId
}

export class CreditHold extends S.TaggedClass<CreditHold>()('CreditHold', {
  orderId: S.String,
  shortfall: CreditAmount,
  requiredDownpayment: CreditAmount,
}) {
  readonly [CreditDecisionTypeId] = CreditDecisionTypeId
}

export class CreditLimitExceeded extends S.TaggedError<CreditLimitExceeded>()('CreditLimitExceeded', {
  customerId: S.String,
  requested: CreditAmount,
  available: CreditAmount,
}) {
  readonly [CreditErrorTypeId] = CreditErrorTypeId
}

export class CreditCheckCommand extends S.Class<CreditCheckCommand>('CreditCheckCommand')({
  orderId: S.String,
  tier: CustomerTier,
  account: CreditAccount,
  requiredAmount: CreditAmount,
}) {}

const headroomOf = (account: CreditAccount): number => Num.max(0, account.creditLimit - account.outstandingBalance)

const shortfallOf = (command: CreditCheckCommand): number =>
  Num.max(0, command.requiredAmount - headroomOf(command.account))

const vipDecision = (command: CreditCheckCommand): Result.Result<CreditGranted | CreditHold, CreditLimitExceeded> => {
  const shortfall = shortfallOf(command)
  return Match.value(shortfall <= command.account.overdraftPrivilege).pipe(
    Match.when(
      true,
      () => Result.succeed(new CreditGranted({ orderId: command.orderId, overdraftAmount: shortfall })),
    ),
    Match.when(false, () =>
      Result.fail(
        new CreditLimitExceeded({
          customerId: command.account.customerId,
          requested: command.requiredAmount,
          available: headroomOf(command.account) + command.account.overdraftPrivilege,
        }),
      )),
    Match.exhaustive,
  )
}

const standardDecision = (
  command: CreditCheckCommand,
): Result.Result<CreditGranted | CreditHold, CreditLimitExceeded> => {
  const shortfall = shortfallOf(command)
  return Match.value(shortfall === 0).pipe(
    Match.when(true, () => Result.succeed(new CreditGranted({ orderId: command.orderId, overdraftAmount: 0 }))),
    Match.when(
      false,
      () =>
        Result.succeed(
          new CreditHold({
            orderId: command.orderId,
            shortfall,
            requiredDownpayment: shortfall,
          }),
        ),
    ),
    Match.exhaustive,
  )
}

export const checkCredit = Workflow.make(
  CreditCheckCommand,
  (command): Result.Result<CreditGranted | CreditHold, CreditLimitExceeded> =>
    Match.type<CustomerTier>().pipe(
      Match.when('VIP', () => vipDecision(command)),
      Match.when('Standard', () => standardDecision(command)),
      Match.exhaustive,
    )(command.tier),
)
