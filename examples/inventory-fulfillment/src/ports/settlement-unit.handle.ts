import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, type Option, Ref, type Scope } from 'effect'
import { dual } from 'effect/Function'
import type { CreditAccount, CustomerTier, Money } from '../fulfillment/credit.schema.js'
import type { CreditAccountNotFound, StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { AuditPayload, InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { WarehouseStockPartition } from '../inventory/inventory.schema.js'

export const TypeId = Symbol.for('@systemfsoftware/example-inventory-fulfillment/SettlementUnit')
export type TypeId = typeof TypeId

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

export type SettlementFailure = CreditAccountNotFound | StoreUnavailable

export interface SettlementUnitDriver {
  readonly load: (key: OrderKey) => Effect.Effect<OrderSnapshot, SettlementFailure>
  readonly settle: (plan: OrderPlan) => Effect.Effect<void, StoreUnavailable>
}

const SettlementUnit = Handle.make<
  Record<never, never>,
  { readonly driver: SettlementUnitDriver; readonly open: Ref.Ref<boolean> }
>()(TypeId)

export type SettlementUnit = Handle.Of<typeof SettlementUnit>

export const isSettlementUnit = SettlementUnit.is

export const open = (driver: SettlementUnitDriver): Effect.Effect<SettlementUnit, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.map(Ref.make(true), (isOpen) => SettlementUnit.make({}, { driver, open: isOpen })),
    (unit) => Ref.set(SettlementUnit.slot(unit).open, false),
  )

const whileOpen = <A, E>(
  self: SettlementUnit,
  use: (driver: SettlementUnitDriver) => Effect.Effect<A, E>,
): Effect.Effect<A, E> => {
  const { driver, open: isOpen } = SettlementUnit.slot(self)
  return Effect.flatMap(
    Ref.get(isOpen),
    (stillOpen) =>
      stillOpen ? use(driver) : Effect.die(new Error('a SettlementUnit was used after its unit of work ended')),
  )
}

export const load: {
  (key: OrderKey): (self: SettlementUnit) => Effect.Effect<OrderSnapshot, SettlementFailure>
  (self: SettlementUnit, key: OrderKey): Effect.Effect<OrderSnapshot, SettlementFailure>
} = dual(2, (self: SettlementUnit, key: OrderKey) => whileOpen(self, (driver) => driver.load(key)))

export const settle: {
  (plan: OrderPlan): (self: SettlementUnit) => Effect.Effect<void, StoreUnavailable>
  (self: SettlementUnit, plan: OrderPlan): Effect.Effect<void, StoreUnavailable>
} = dual(2, (self: SettlementUnit, plan: OrderPlan) => whileOpen(self, (driver) => driver.settle(plan)))
