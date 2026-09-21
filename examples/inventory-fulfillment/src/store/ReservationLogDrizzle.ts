import { sql } from 'drizzle-orm'
import { and, eq } from 'drizzle-orm/sql/expressions/conditions'
import { Array as Arr, DateTime, Effect, Match, Option } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { AuditPayload, InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { LotAllocation } from '../inventory/inventory.schema.js'
import type { ReservationCommit, ReservationRecord } from '../ports/ReservationLog.js'
import { decodeLotAllocation } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { auditEvents, reservations, stockLots } from './schema.tables.js'

interface AllocationBatch {
  readonly allocations: readonly LotAllocation[]
  readonly occurredAt: DateTime.Utc
}

type ReservationRow = typeof reservations.$inferSelect

const allocationBatches = (events: readonly InventoryReservationEvents[]): readonly AllocationBatch[] =>
  Arr.getSomes(
    Arr.map(events, (event) =>
      Match.value(event).pipe(
        Match.tag(
          'StockReserved',
          (stockReserved) =>
            Option.some({ allocations: stockReserved.allocations, occurredAt: stockReserved.occurredAt }),
        ),
        Match.tag(
          'ReservationRolledBack',
          (rolledBack) => Option.some({ allocations: rolledBack.allocations, occurredAt: rolledBack.occurredAt }),
        ),
        Match.tag('BackorderRecorded', () => Option.none()),
        Match.exhaustive,
      )),
  )

const allocationsOf = (batches: readonly AllocationBatch[]): readonly LotAllocation[] =>
  Arr.flatMap(batches, (batch) => batch.allocations)

const reservationRowsOf = (commit: ReservationCommit, batches: readonly AllocationBatch[]) =>
  Arr.flatMap(batches, (batch) =>
    Arr.map(batch.allocations, (allocation) => ({
      id: `${commit.orderId}:${allocation.lotId}`,
      orderId: commit.orderId,
      customerId: commit.customerId,
      sku: allocation.sku,
      warehouseId: allocation.warehouseId,
      lotId: allocation.lotId,
      quantity: allocation.quantity,
      version: allocation.version,
      occurredAt: DateTime.toDate(batch.occurredAt),
    })))

const auditRowOf = (audit: AuditPayload) => ({
  id: `${audit.orderId}:audit`,
  orderId: audit.orderId,
  actorId: audit.actorId,
  decisionTag: audit.decisionTag,
  occurredAt: DateTime.toDate(audit.occurredAt),
})

const hasVersionConflict = (results: readonly (readonly { readonly lotId: string }[])[]): boolean =>
  Arr.some(results, (updated) => updated.length !== 1)

const commitEffect = (db: DrizzleDatabase, commit: ReservationCommit) => {
  const batches = allocationBatches(commit.events)
  const rows = reservationRowsOf(commit, batches)
  return db
    .transaction((tx) =>
      Effect.gen(function*() {
        const casResults = yield* Effect.forEach(allocationsOf(batches), (allocation) =>
          tx
            .update(stockLots)
            .set({
              quantityOnHand: sql`${stockLots.quantityOnHand} - ${allocation.quantity}`,
              version: allocation.version + 1,
            })
            .where(and(eq(stockLots.id, allocation.lotId), eq(stockLots.version, allocation.version)))
            .returning({ lotId: stockLots.id }))
        if (hasVersionConflict(casResults)) {
          return yield* tx.rollback()
        }
        yield* Effect.forEach(rows, (row) => tx.insert(reservations).values(row), { discard: true })
        yield* tx.insert(auditEvents).values(auditRowOf(commit.audit))
        return 'Committed' as const
      })
    )
    .pipe(Effect.catchTag('EffectTransactionRollbackError', () => Effect.succeed('VersionConflict' as const)))
}

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

export const make = Effect.gen(function*() {
  const db = yield* DrizzleSession
  return {
    findReservation: (orderId: string) => findReservation(db, orderId).pipe(Effect.orDie),
    commit: (input: ReservationCommit) => commitEffect(db, input).pipe(Effect.orDie),
  }
})
