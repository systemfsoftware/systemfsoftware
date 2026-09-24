import { Context, type DateTime, type Effect, type Option } from 'effect'
import { StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { AuditPayload } from '../fulfillment/event.schema.js'
import type { LotAllocation } from '../inventory/inventory.schema.js'

export interface ReservationRecord {
  readonly orderId: string
  readonly customerId: string
  readonly allocations: readonly LotAllocation[]
  readonly occurredAt: DateTime.Utc
}

export interface ReservationLogService {
  readonly findReservation: (orderId: string) => Effect.Effect<Option.Option<ReservationRecord>, StoreUnavailable>
  /**
   * Appends the rollback audit row under its own id (`<orderId>:rollback`),
   * ignoring a row that is already there, so a resubmitted order never
   * collides with its earlier rollback.
   */
  readonly appendRollback: (audit: AuditPayload) => Effect.Effect<void, StoreUnavailable>
}

export class ReservationLog extends Context.Service<ReservationLog, ReservationLogService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/ReservationLog',
) {}
