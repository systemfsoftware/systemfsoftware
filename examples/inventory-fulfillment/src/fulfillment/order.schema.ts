import { Schema as S } from 'effect'
import { Quantity, SkuId } from '../inventory/inventory.schema.js'

export class OrderLine extends S.Class<OrderLine>('OrderLine')({
  sku: SkuId,
  quantity: Quantity,
}) {}

export class Order extends S.Class<Order>('Order')({
  orderId: S.String,
  customerId: S.String,
  lines: S.Array(OrderLine),
}) {}
