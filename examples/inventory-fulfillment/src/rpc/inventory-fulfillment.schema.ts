import { Schema as S } from 'effect'
import { FraudRiskScore } from '../fulfillment/credit.schema.js'
import { OrderLine } from '../fulfillment/order.schema.js'
import { KitDefinition, LotAllocation, WarehouseStockPartition } from '../inventory/inventory.schema.js'

export class SubmitOrderRequest extends S.Class<SubmitOrderRequest>('SubmitOrderRequest')({
  orderId: S.String,
  lines: S.Array(OrderLine),
  kits: S.Array(KitDefinition),
  fraudRisk: FraudRiskScore,
}) {}

export class GetReservationRequest extends S.Class<GetReservationRequest>('GetReservationRequest')({
  orderId: S.String,
}) {}

export class ListStockRequest extends S.Class<ListStockRequest>('ListStockRequest')({
  cursor: S.optional(S.String),
  warehouseId: S.optional(S.String),
  limit: S.optional(S.Int),
}) {}

export class ReservationView extends S.Class<ReservationView>('ReservationView')({
  orderId: S.String,
  customerId: S.String,
  allocations: S.Array(LotAllocation),
  occurredAt: S.DateTimeUtc,
}) {}

export class StockView extends S.Class<StockView>('StockView')({
  partitions: S.Array(WarehouseStockPartition),
  nextCursor: S.NullOr(S.String),
}) {}
