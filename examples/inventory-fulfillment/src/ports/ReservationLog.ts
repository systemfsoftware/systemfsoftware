import { Context, type DateTime, type Effect, Layer, type Option } from 'effect'
import type { AuditPayload } from '../fulfillment/event.schema.js'
import type { LotAllocation } from '../inventory/inventory.schema.js'
import { make as makeDrizzle } from '../store/ReservationLogDrizzle.js'

export interface ReservationRecord {
  readonly orderId: string
  readonly customerId: string
  readonly allocations: readonly LotAllocation[]
  readonly occurredAt: DateTime.Utc
}

export interface ReservationLogService {
  readonly findReservation: (orderId: string) => Effect.Effect<Option.Option<ReservationRecord>>
  /**
   * Appends the rollback audit row under its own id (`<orderId>:rollback`),
   * ignoring a row that is already there, so a resubmitted order never
   * collides with its earlier rollback.
   */
  readonly appendRollback: (audit: AuditPayload) => Effect.Effect<void>
}

export class ReservationLog extends Context.Service<ReservationLog, ReservationLogService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/ReservationLog',
) {
  static readonly Live = Layer.effect(this, makeDrizzle)
}
