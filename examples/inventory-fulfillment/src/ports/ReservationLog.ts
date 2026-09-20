import { Context, type DateTime, Effect, Option } from 'effect'
import type { AuditPayload, InventoryReservationEvents } from '../domain/event.schema.js'
import type { LotAllocation } from '../domain/inventory.schema.js'

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
) {}
