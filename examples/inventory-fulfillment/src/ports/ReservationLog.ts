import { Context, type DateTime, type Effect, Layer, type Option } from 'effect'
import type { AuditPayload, InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { LotAllocation } from '../inventory/inventory.schema.js'
import { make as makeDrizzle } from '../store/ReservationLogDrizzle.js'

export interface ReservationCommit {
  readonly orderId: string
  readonly customerId: string
  readonly events: readonly InventoryReservationEvents[]
  readonly audit: AuditPayload
}

export type ReservationCommitOutcome = 'Committed' | 'VersionConflict'

export interface ReservationRecord {
  readonly orderId: string
  readonly customerId: string
  readonly allocations: readonly LotAllocation[]
  readonly occurredAt: DateTime.Utc
}

export interface ReservationLogService {
  readonly findReservation: (orderId: string) => Effect.Effect<Option.Option<ReservationRecord>>
  readonly commit: (commit: ReservationCommit) => Effect.Effect<ReservationCommitOutcome>
}

export class ReservationLog extends Context.Service<ReservationLog, ReservationLogService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/ReservationLog',
) {
  static readonly Live = Layer.effect(this, makeDrizzle)
}
