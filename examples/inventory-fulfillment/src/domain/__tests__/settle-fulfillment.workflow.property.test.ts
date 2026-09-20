import { describe, it } from '@effect/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type { InsufficientStock } from '../allocate-stock.workflow.js'
import type { CreditLimitExceeded } from '../check-credit.workflow.js'
import { settleFulfillment, SettleFulfillmentCommand } from '../settle-fulfillment.workflow.js'
import type {
  OrderAllocated,
  OrderAllocatedWithOverdraft,
  OrderBackordered,
  OrderHeld,
} from '../settle-fulfillment.workflow.js'

const FAMILY_BRAND: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/SettleFulfillmentDecision',
)

type SettleResult = Result.Result<
  OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld,
  InsufficientStock | CreditLimitExceeded
>

const isFamilyDecision = (result: SettleResult): boolean =>
  Result.match(result, {
    onFailure: (error) =>
      Match.value(error).pipe(
        Match.tag('InsufficientStock', () => true),
        Match.tag('CreditLimitExceeded', () => true),
        Match.exhaustive,
      ),
    onSuccess: (decision) =>
      Object.getOwnPropertySymbols(decision).includes(FAMILY_BRAND) &&
      Match.value(decision).pipe(
        Match.tag('OrderAllocated', () => true),
        Match.tag('OrderAllocatedWithOverdraft', () => true),
        Match.tag('OrderBackordered', () => true),
        Match.tag('OrderHeld', () => true),
        Match.exhaustive,
      ),
  })

describe('settleFulfillment — decision family', () => {
  it.prop(
    '∀c_SettleDecision_=Family',
    [SettleFulfillmentCommand],
    ([command]) => isFamilyDecision(settleFulfillment(command)),
  )
})
