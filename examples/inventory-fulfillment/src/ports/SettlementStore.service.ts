import { Context, type Effect } from 'effect'
import type { CustomerTier } from '../fulfillment/credit.schema.js'
import type { StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { SettlementUnit } from './settlement-unit.handle.js'

export interface SettlementStoreService {
  readonly unitOfWork: <A, E, R>(
    use: (unit: SettlementUnit) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StoreUnavailable, R>
}

export interface SettlementStoreSeed {
  readonly warehouses: readonly { readonly warehouseId: string; readonly region: string }[]
  readonly lots: readonly {
    readonly lotId: string
    readonly sku: string
    readonly warehouseId: string
    readonly quantityOnHand: number
    readonly version: number
  }[]
  readonly customers: readonly {
    readonly customerId: string
    readonly tier: CustomerTier
    readonly creditLimit: number
    readonly outstandingBalance: number
    readonly overdraftPrivilege: number
  }[]
}

export class SettlementStore extends Context.Service<SettlementStore, SettlementStoreService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/SettlementStore',
) {}
