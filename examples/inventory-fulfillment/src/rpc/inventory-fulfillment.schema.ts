import { Schema as S } from 'effect'
import { FraudRiskScore } from '../fulfillment/credit.schema.js'
import { OrderLine } from '../fulfillment/order.schema.js'
import {
  KitDefinition,
  LotAllocation,
  StockCursor,
  StockPageSize,
  WarehouseStockPartition,
} from '../inventory/inventory.schema.js'

export const SubmitOrderRequest = S.Struct({
  orderId: S.String,
  lines: S.Array(OrderLine),
  kits: S.Array(KitDefinition),
  fraudRisk: FraudRiskScore,
})
export type SubmitOrderRequest = S.Schema.Type<typeof SubmitOrderRequest>

export const GetReservationRequest = S.Struct({
  orderId: S.String,
})
export type GetReservationRequest = S.Schema.Type<typeof GetReservationRequest>

export const ListStockRequest = S.Struct({
  cursor: S.optional(StockCursor),
  warehouseId: S.optional(S.String),
  limit: S.optional(StockPageSize),
})
export type ListStockRequest = S.Schema.Type<typeof ListStockRequest>

export const ReservationView = S.Struct({
  orderId: S.String,
  customerId: S.String,
  allocations: S.Array(LotAllocation),
  occurredAt: S.DateTimeUtc,
})
export type ReservationView = S.Schema.Type<typeof ReservationView>

export const StockView = S.Struct({
  partitions: S.Array(WarehouseStockPartition),
  nextCursor: S.NullOr(S.String),
})
export type StockView = S.Schema.Type<typeof StockView>
