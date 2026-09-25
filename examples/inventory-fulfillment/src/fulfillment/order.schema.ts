import { Schema as S } from 'effect'
import { Quantity, SkuId } from '../inventory/inventory.schema.js'

export const OrderLine = S.Struct({
  sku: SkuId,
  quantity: Quantity,
})
export type OrderLine = S.Schema.Type<typeof OrderLine>

export const Order = S.Struct({
  orderId: S.String,
  customerId: S.String,
  lines: S.Array(OrderLine),
})
export type Order = S.Schema.Type<typeof Order>
