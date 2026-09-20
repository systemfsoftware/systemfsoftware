import { Schema as S } from 'effect'
import { LotAllocation } from './inventory.schema.js'
import { OrderLine } from './order.schema.js'

const InventoryReservationEventsTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/InventoryReservationEvents',
)
export type InventoryReservationEventsTypeId = typeof InventoryReservationEventsTypeId

const AuditPayloadTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/AuditPayload',
)
export type AuditPayloadTypeId = typeof AuditPayloadTypeId

export class StockReserved extends S.TaggedClass<StockReserved>()('StockReserved', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
  occurredAt: S.DateTimeUtc,
}) {
  readonly [InventoryReservationEventsTypeId] = InventoryReservationEventsTypeId
}

export class BackorderRecorded extends S.TaggedClass<BackorderRecorded>()('BackorderRecorded', {
  orderId: S.String,
  backorderedLines: S.Array(OrderLine),
  occurredAt: S.DateTimeUtc,
}) {
  readonly [InventoryReservationEventsTypeId] = InventoryReservationEventsTypeId
}

export class ReservationRolledBack extends S.TaggedClass<ReservationRolledBack>()('ReservationRolledBack', {
  orderId: S.String,
  reason: S.String,
  allocations: S.Array(LotAllocation),
  occurredAt: S.DateTimeUtc,
}) {
  readonly [InventoryReservationEventsTypeId] = InventoryReservationEventsTypeId
}

export const InventoryReservationEvents = S.Union([StockReserved, BackorderRecorded, ReservationRolledBack])
export type InventoryReservationEvents = S.Schema.Type<typeof InventoryReservationEvents>

export class AuditPayload extends S.Class<AuditPayload>('AuditPayload')({
  orderId: S.String,
  actorId: S.String,
  decisionTag: S.String,
  occurredAt: S.DateTimeUtc,
}) {
  readonly [AuditPayloadTypeId] = AuditPayloadTypeId
}
