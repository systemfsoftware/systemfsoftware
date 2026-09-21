import { Schema as S } from 'effect'
import { FraudRiskScore } from '../domain/credit.schema.js'
import { KitDefinition, LotAllocation, WarehouseStockPartition } from '../domain/inventory.schema.js'
import { OrderLine } from '../domain/order.schema.js'

export class SubmitOrderRequest extends S.Class<SubmitOrderRequest>('SubmitOrderRequest')({
  orderId: S.String,
  customerId: S.String,
  lines: S.Array(OrderLine),
  kits: S.Array(KitDefinition),
  fraudRisk: FraudRiskScore,
}) {}

export class GetReservationRequest extends S.Class<GetReservationRequest>('GetReservationRequest')({
  orderId: S.String,
}) {}

export class ListStockRequest extends S.Class<ListStockRequest>('ListStockRequest')({}) {}

export class ReservationView extends S.Class<ReservationView>('ReservationView')({
  orderId: S.String,
  customerId: S.String,
  allocations: S.Array(LotAllocation),
  occurredAt: S.DateTimeUtc,
}) {}

export class StockView extends S.Class<StockView>('StockView')({
  partitions: S.Array(WarehouseStockPartition),
}) {}
