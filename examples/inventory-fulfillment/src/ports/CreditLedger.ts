import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core'
import { Context, Effect } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { CreditAccount, CustomerTier, Money } from '../domain/credit.schema.js'
import { CreditAccountNotFound } from '../domain/decision.schema.js'

export interface CustomerCredit {
  readonly account: CreditAccount
  readonly tier: CustomerTier
}

export interface CreditLedgerService {
  readonly readCredit: (
    customerId: string,
  ) => Effect.Effect<CustomerCredit, CreditAccountNotFound | SchemaError | EffectDrizzleQueryError>
  /**
   * Adds `amount` to the customer's outstanding balance. The increment is the
   * charge leg of the credit read-modify-write, so it must be called inside the
   * same per-customer critical section as the read that authorized it.
   */
  readonly charge: (customerId: string, amount: Money) => Effect.Effect<void>
}

export class CreditLedger extends Context.Service<CreditLedger, CreditLedgerService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/CreditLedger',
) {}
