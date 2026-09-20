import { Context, Effect } from 'effect'
import type { CreditAccount, CustomerTier } from '../domain/credit.schema.js'

export interface CustomerCredit {
  readonly account: CreditAccount
  readonly tier: CustomerTier
}

export interface CreditLedgerService {
  readonly readCredit: (customerId: string) => Effect.Effect<CustomerCredit>
}

export class CreditLedger extends Context.Service<CreditLedger, CreditLedgerService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/CreditLedger',
) {}
