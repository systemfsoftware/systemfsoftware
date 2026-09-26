import { Conformance } from '@systemfsoftware/conformance-spec'
import { Fulfillment, Inventory, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Exit, Option, Schema as S } from 'effect'
import * as Result from 'effect/Result'

const SKU = 'sku-1'
const WAREHOUSE = 'warehouse-north'
const ORDER_ID = 'order-1'
const CUSTOMER_ID = 'customer-1'

export interface OrderWorld {
  readonly settled: Array<string>
  readonly reserved: Map<string, string>
  readonly request: Fulfillment.Cell.PlaceOrderRequest
  readonly key: Settlement.Unit.OrderKey
  opened: Settlement.Unit.SettlementUnit | undefined
}

const creditAccount = (customerId: string): Fulfillment.Credit.CreditAccount => ({
  customerId,
  creditLimit: Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(1000)),
  outstandingBalance: Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(0)),
  overdraftPrivilege: Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(0)),
})

const standardTier: Fulfillment.Credit.CustomerTier = 'Standard'

const stockPartition = (sku: string): Inventory.Schema.WarehouseStockPartition => ({
  warehouseId: Result.getOrThrow(S.decodeResult(Inventory.Schema.WarehouseId)(WAREHOUSE)),
  region: 'north',
  lots: [
    {
      lotId: Result.getOrThrow(S.decodeResult(Inventory.Schema.LotId)('lot-1')),
      sku: Result.getOrThrow(S.decodeResult(Inventory.Schema.SkuId)(sku)),
      warehouseId: Result.getOrThrow(S.decodeResult(Inventory.Schema.WarehouseId)(WAREHOUSE)),
      quantityOnHand: Result.getOrThrow(S.decodeResult(Inventory.Schema.QuantityOnHand)(10)),
      version: Result.getOrThrow(S.decodeResult(Inventory.Schema.Version)(1)),
      expiresAt: Option.none(),
    },
  ],
})

export const driverOf = (world: OrderWorld): Settlement.Unit.SettlementUnitDriver => ({
  load: (key) =>
    Effect.sync(() => ({
      account: creditAccount(key.customerId),
      tier: standardTier,
      stock: [stockPartition(key.skus[0] ?? SKU)],
      reservedBy: Option.fromNullishOr(world.reserved.get(key.orderId)),
    })),
  settle: (plan) =>
    Effect.sync(() => {
      world.settled.push(plan.orderId)
      world.reserved.set(plan.orderId, plan.customerId)
    }),
})

export const freshOrderWorld = (): OrderWorld => ({
  settled: [],
  reserved: new Map(),
  request: {
    orderId: ORDER_ID,
    customerId: CUSTOMER_ID,
    lines: [
      {
        sku: Result.getOrThrow(S.decodeResult(Inventory.Schema.SkuId)(SKU)),
        quantity: Result.getOrThrow(S.decodeResult(Inventory.Schema.Quantity)(2)),
      },
    ],
    kits: [],
  },
  key: { orderId: ORDER_ID, customerId: CUSTOMER_ID, skus: [SKU] },
  opened: undefined,
})

export const runPlaceOrderCell = (world: OrderWorld) =>
  Effect.scoped(
    Effect.flatMap(Settlement.Unit.open(driverOf(world)), (unit) =>
      Effect.asVoid(Fulfillment.Cell.placeOrderCell(unit).run(world.request))),
  )

export const runSettlementUnit = (world: OrderWorld) =>
  Effect.scoped(
    Effect.flatMap(Settlement.Unit.open(driverOf(world)), (unit) => {
      world.opened = unit
      return Effect.asVoid(Settlement.Unit.load(unit, world.key))
    }),
  )

export const settledAtMostOnce = (world: OrderWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    const count = world.settled.filter((id) => id === world.request.orderId).length
    return count <= 1
      ? Effect.void
      : Effect.fail(new Conformance.RuleBroken({ message: `the order was settled ${count} times` }))
  })

export const unitOfWorkClosed = (world: OrderWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    if (world.opened === undefined) return
    const exit = yield* Effect.exit(Settlement.Unit.load(world.opened, world.key))
    if (!Exit.isSuccess(exit)) return
    return yield* new Conformance.RuleBroken({ message: 'the unit of work was still open after the stop' })
  })
