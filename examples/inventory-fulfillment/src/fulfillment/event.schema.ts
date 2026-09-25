import { Schema as S } from 'effect'
import { LotAllocation } from '../inventory/inventory.schema.js'
import { OrderLine } from './order.schema.js'

export const StockReserved = S.TaggedStruct('StockReserved', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
  occurredAt: S.DateTimeUtc,
})
export type StockReserved = S.Schema.Type<typeof StockReserved>

export const BackorderRecorded = S.TaggedStruct('BackorderRecorded', {
  orderId: S.String,
  backorderedLines: S.Array(OrderLine),
  occurredAt: S.DateTimeUtc,
})
export type BackorderRecorded = S.Schema.Type<typeof BackorderRecorded>

export const InventoryReservationEvents = S.Union([StockReserved, BackorderRecorded])
export type InventoryReservationEvents = S.Schema.Type<typeof InventoryReservationEvents>

export const AuditPayload = S.Struct({
  orderId: S.String,
  actorId: S.String,
  decisionTag: S.String,
  occurredAt: S.DateTimeUtc,
})
export type AuditPayload = S.Schema.Type<typeof AuditPayload>
