import { describe, it } from '@effect/vitest'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Result from 'effect/Result'
import { checkCredit, CreditCheckCommand, CreditGranted, CreditHold } from '../check-credit.workflow.js'
import type { CreditLimitExceeded } from '../check-credit.workflow.js'
import type { CreditAccount } from '../credit.schema.js'

type CreditResult = Result.Result<CreditGranted | CreditHold, CreditLimitExceeded>

const headroomOf = (account: CreditAccount): number => Num.max(0, account.creditLimit - account.outstandingBalance)

const shortfallOf = (command: CreditCheckCommand): number =>
  Num.max(0, command.requiredAmount - headroomOf(command.account))

const grantedWith = (expected: number) => (decision: CreditGranted | CreditHold): boolean =>
  Match.value(decision).pipe(
    Match.tag('CreditGranted', (granted) => granted.overdraftAmount === expected),
    Match.tag('CreditHold', () => false),
    Match.exhaustive,
  )

const heldWith = (expected: number) => (decision: CreditGranted | CreditHold): boolean =>
  Match.value(decision).pipe(
    Match.tag('CreditGranted', () => false),
    Match.tag('CreditHold', (held) => held.shortfall === expected && held.requiredDownpayment === expected),
    Match.exhaustive,
  )

const matchesTierContract = (command: CreditCheckCommand, result: CreditResult): boolean => {
  const shortfall = shortfallOf(command)
  if (command.tier === 'VIP') {
    if (shortfall <= command.account.overdraftPrivilege) {
      return Result.match(result, { onFailure: () => false, onSuccess: grantedWith(shortfall) })
    }
    return Result.isFailure(result)
  }
  if (shortfall === 0) {
    return Result.match(result, { onFailure: () => false, onSuccess: grantedWith(0) })
  }
  return Result.match(result, { onFailure: () => false, onSuccess: heldWith(shortfall) })
}

const overdraftWithinPrivilege = (command: CreditCheckCommand, result: CreditResult): boolean =>
  Result.match(result, {
    onFailure: () => true,
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag(
          'CreditGranted',
          (granted) =>
            granted.overdraftAmount === 0 ||
            (command.tier === 'VIP' && granted.overdraftAmount <= command.account.overdraftPrivilege),
        ),
        Match.tag('CreditHold', () => true),
        Match.exhaustive,
      ),
  })

describe('checkCredit — tier contract', () => {
  it.prop(
    '∀c_CreditOutcome_=Tier',
    [CreditCheckCommand],
    ([command]) => matchesTierContract(command, checkCredit(command)),
  )

  it.prop(
    '∀c_Overdraft_≤Privilege',
    [CreditCheckCommand],
    ([command]) => overdraftWithinPrivilege(command, checkCredit(command)),
  )
})
