import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core'
import { Context, type Effect, Layer, type Option } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { CreditAccount, CustomerTier, Money } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound } from '../fulfillment/decision.schema.js'
import type { AuditPayload, InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { WarehouseStockPartition } from '../inventory/inventory.schema.js'
import type { CreditProof, StockProof } from '../store/SettlementProof.js'
import { make as makeDrizzle } from '../store/SettlementStoreDrizzle.js'
import { make as makeMemory } from '../store/SettlementStoreMemory.js'

export interface CreditObservation {
  readonly account: CreditAccount
  readonly tier: CustomerTier
  readonly proof: CreditProof
}

export interface StockObservation {
  readonly partitions: readonly WarehouseStockPartition[]
  readonly proof: StockProof
}

export interface SettlementCharge {
  readonly amount: Money
  readonly proof: CreditProof
}

/**
 * Everything the one atomic commit needs: the reservation events and audit row
 * to write, the stock proof that vouches for every allocated lot, and — for a
 * decision that charges — the amount plus the credit proof that vouches for
 * the account. Absent for held or backordered decisions.
 */
export interface SettlementCommand {
  readonly orderId: string
  readonly customerId: string
  readonly events: readonly InventoryReservationEvents[]
  readonly audit: AuditPayload
  readonly stock: StockProof
  readonly charge: Option.Option<SettlementCharge>
}

export type SettlementOutcome = 'Committed' | 'Conflict'

export interface SettlementStoreService {
  readonly readCredit: (
    customerId: string,
  ) => Effect.Effect<CreditObservation, CreditAccountNotFound | SchemaError | EffectDrizzleQueryError>
  readonly readAllStock: Effect.Effect<StockObservation>
  readonly settle: (command: SettlementCommand) => Effect.Effect<SettlementOutcome>
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
) {
  static readonly Live = Layer.effect(this, makeDrizzle)
  static readonly memory = (seed: SettlementStoreSeed): Layer.Layer<SettlementStore> =>
    Layer.effect(this, makeMemory(seed))
}

export type { CreditProof, StockProof } from '../store/SettlementProof.js'
