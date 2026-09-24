import { Context, type Effect, type Option } from 'effect'
import type { CreditAccount, CustomerTier, Money } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound, StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { AuditPayload, InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { WarehouseStockPartition } from '../inventory/inventory.schema.js'

/** What one order reads: its customer's credit row and the lots of its SKUs. */
export interface OrderKey {
  readonly orderId: string
  readonly customerId: string
  readonly skus: readonly string[]
}

export interface OrderSnapshot {
  readonly account: CreditAccount
  readonly tier: CustomerTier
  readonly stock: readonly WarehouseStockPartition[]
  readonly reservedBy: Option.Option<string>
}

export interface OrderPlan {
  readonly orderId: string
  readonly customerId: string
  readonly charge: Option.Option<Money>
  readonly events: readonly InventoryReservationEvents[]
  readonly audit: AuditPayload
}

/**
 * Present in `R` while the store's unit of work is open. Only
 * {@link SettlementStoreService.unitOfWork} removes it; a hand-provided value
 * dies inside the adapter before any query runs.
 */
export class UnitOfWork extends Context.Service<UnitOfWork, { readonly open: true }>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/SettlementStore/UnitOfWork',
) {}

export type SettlementFailure = CreditAccountNotFound | StoreUnavailable

export interface SettlementStoreService {
  readonly load: (key: OrderKey) => Effect.Effect<OrderSnapshot, SettlementFailure, UnitOfWork>
  readonly settle: (plan: OrderPlan) => Effect.Effect<void, StoreUnavailable, UnitOfWork>
  readonly unitOfWork: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StoreUnavailable, Exclude<R, UnitOfWork>>
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
