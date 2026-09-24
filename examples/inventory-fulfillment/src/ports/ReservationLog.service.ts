import { Context, type DateTime, type Effect, type Option } from 'effect'
import { StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { LotAllocation } from '../inventory/inventory.schema.js'

export interface ReservationRecord {
  readonly orderId: string
  readonly customerId: string
  readonly allocations: readonly LotAllocation[]
  readonly occurredAt: DateTime.Utc
}

export interface ReservationLogService {
  readonly findReservation: (orderId: string) => Effect.Effect<Option.Option<ReservationRecord>, StoreUnavailable>
}

export class ReservationLog extends Context.Service<ReservationLog, ReservationLogService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/ReservationLog',
) {}
