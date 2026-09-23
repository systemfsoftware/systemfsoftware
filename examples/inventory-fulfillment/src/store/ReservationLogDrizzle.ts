import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { DateTime, Effect, Option } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { AuditPayload } from '../fulfillment/event.schema.js'
import type { ReservationRecord } from '../ports/ReservationLog.js'
import { decodeLotAllocation } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { auditEvents, reservations } from './schema.tables.js'

type ReservationRow = typeof reservations.$inferSelect

const allocationRowOf = (row: ReservationRow) => ({
  warehouseId: row.warehouseId,
  lotId: row.lotId,
  sku: row.sku,
  quantity: row.quantity,
  version: row.version,
})

const reservationRecord = (
  rows: readonly ReservationRow[],
): Effect.Effect<Option.Option<ReservationRecord>, SchemaError> =>
  Option.match(Option.fromUndefinedOr(rows[0]), {
    onNone: () => Effect.succeed(Option.none<ReservationRecord>()),
    onSome: (first) =>
      Effect.gen(function*() {
        const allocations = yield* Effect.forEach(rows, (row) => decodeLotAllocation(allocationRowOf(row)))
        return Option.some({
          orderId: first.orderId,
          customerId: first.customerId,
          allocations,
          occurredAt: DateTime.fromDateUnsafe(first.occurredAt),
        })
      }),
  })

const findReservation = (db: DrizzleDatabase, orderId: string) =>
  Effect.gen(function*() {
    const rows: readonly ReservationRow[] = yield* db
      .select()
      .from(reservations)
      .where(eq(reservations.orderId, orderId))
    return yield* reservationRecord(rows)
  })

const appendRollback = (db: DrizzleDatabase, audit: AuditPayload) =>
  db
    .insert(auditEvents)
    .values({
      id: `${audit.orderId}:rollback`,
      orderId: audit.orderId,
      actorId: audit.actorId,
      decisionTag: audit.decisionTag,
      occurredAt: DateTime.toDate(audit.occurredAt),
    })
    .onConflictDoNothing()
    .pipe(Effect.asVoid, Effect.orDie)

export const make = Effect.gen(function*() {
  const db = yield* DrizzleSession
  return {
    findReservation: (orderId: string) => findReservation(db, orderId).pipe(Effect.orDie),
    appendRollback: (audit: AuditPayload) => appendRollback(db, audit),
  }
})
