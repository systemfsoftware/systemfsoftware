import { Schema as S } from 'effect'
import { KitDefinition, SkuId, WarehouseStockPartition } from '../inventory/inventory.schema.js'
import { CreditAccount, CustomerTier, FraudRiskScore } from './credit.schema.js'

const OrderFulfillmentCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/OrderFulfillmentCommand',
)
export type OrderFulfillmentCommandTypeId = typeof OrderFulfillmentCommandTypeId

const Quantity = S.Int.pipe(S.check(S.isGreaterThan(0)))

export class OrderLine extends S.Class<OrderLine>('OrderLine')({
  sku: SkuId,
  quantity: Quantity,
}) {}

export class Order extends S.Class<Order>('Order')({
  orderId: S.String,
  customerId: S.String,
  lines: S.Array(OrderLine),
}) {}

export class OrderFulfillmentCommand extends S.Class<OrderFulfillmentCommand>('OrderFulfillmentCommand')({
  order: Order,
  customerTier: CustomerTier,
  fraudRisk: FraudRiskScore,
  credit: CreditAccount,
  stock: S.Array(WarehouseStockPartition),
  kits: S.Array(KitDefinition),
  now: S.DateTimeUtc,
}) {
  readonly [OrderFulfillmentCommandTypeId] = OrderFulfillmentCommandTypeId
}
