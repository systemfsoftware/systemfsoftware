import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Fulfillment, Inventory, Persistence, Reservation } from '@systemfsoftware/example-inventory-fulfillment'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { Array as Arr, DateTime, Effect, Layer, Option, Order, Result, Schema as S } from 'effect'
import { dual } from 'effect/Function'

export const FIRST_ORDER = 'order-first'
export const SECOND_ORDER = 'order-second'
export const UNKNOWN_ORDER = 'order-vanished'

const occurredAt = DateTime.makeUnsafe('2026-01-01T00:00:00.000Z')

const allocationOf = (warehouseId: string, lotId: string, sku: string, quantity: number) =>
  Result.getOrThrow(
    S.decodeResult(Inventory.Schema.LotAllocation)({ warehouseId, lotId, sku, quantity }),
  )

export const reservationLogSeed = (): Reservation.Memory.ReservationLogSeed => ({
  reservations: [
    {
      orderId: FIRST_ORDER,
      customerId: 'customer-one',
      allocations: [
        allocationOf('warehouse-central', 'lot-kettle-a', 'sku-kettle', 2),
        allocationOf('warehouse-central', 'lot-teapot-a', 'sku-teapot', 1),
      ],
      occurredAt,
    },
    {
      orderId: SECOND_ORDER,
      customerId: 'customer-two',
      allocations: [allocationOf('warehouse-north', 'lot-mug-a', 'sku-mug', 3)],
      occurredAt,
    },
  ],
})

const seedPostgres = Effect.gen(function*() {
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const rows = Arr.flatMap(
    reservationLogSeed().reservations,
    (reservation) =>
      Arr.map(reservation.allocations, (allocation) => ({
        id: `${reservation.orderId}:${allocation.lotId}`,
        orderId: reservation.orderId,
        customerId: reservation.customerId,
        sku: allocation.sku,
        warehouseId: allocation.warehouseId,
        lotId: allocation.lotId,
        quantity: allocation.quantity,
        version: 1,
        occurredAt: DateTime.toDate(reservation.occurredAt),
      })),
  )
  yield* db.insert(Persistence.Tables.reservations).values(rows).onConflictDoNothing()
})

export const reservationLogWorld: Layer.Layer<Persistence.DrizzleSession.DrizzleSession> = Persistence.DrizzleSession
  .layerTest.pipe(Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)))

/** Runs one law against both adapters and reports what each of them answered. */
export const acrossLogs = <A, E>(
  law: Effect.Effect<A, E, Reservation.Log.ReservationLog>,
): Effect.Effect<{ readonly memory: A; readonly postgres: A }, E, Persistence.DrizzleSession.DrizzleSession> =>
  Effect.gen(function*() {
    const memory = yield* Effect.provide(law, Reservation.Memory.layer(reservationLogSeed()))
    yield* Effect.orDie(seedPostgres)
    const postgres = yield* Effect.provide(law, Reservation.Drizzle.layer)
    return { memory, postgres }
  })

export interface ReservationView {
  readonly found: boolean
  readonly orderId: string
  readonly customerId: string
  readonly allocations: readonly {
    readonly warehouseId: string
    readonly lotId: string
    readonly sku: string
    readonly quantity: number
  }[]
  readonly occurredAtMillis: number
}

const absent: ReservationView = {
  found: false,
  orderId: '',
  customerId: '',
  allocations: [],
  occurredAtMillis: 0,
}

const byLotId = Order.mapInput(Order.String, (allocation: { readonly lotId: string }) => allocation.lotId)

export const reservationViewOf = (found: Option.Option<Reservation.Log.ReservationRecord>): ReservationView =>
  Option.match(found, {
    onNone: () => absent,
    onSome: (record) => ({
      found: true,
      orderId: record.orderId,
      customerId: record.customerId,
      allocations: Arr.sort(
        Arr.map(record.allocations, (allocation) => ({
          warehouseId: allocation.warehouseId,
          lotId: allocation.lotId,
          sku: allocation.sku,
          quantity: allocation.quantity,
        })),
        byLotId,
      ),
      occurredAtMillis: DateTime.toEpochMillis(record.occurredAt),
    }),
  })

export const findOf: {
  (orderId: string): (
    log: Reservation.Log.ReservationLogService,
  ) => Effect.Effect<ReservationView, Fulfillment.Decision.StoreUnavailable>
  (
    log: Reservation.Log.ReservationLogService,
    orderId: string,
  ): Effect.Effect<ReservationView, Fulfillment.Decision.StoreUnavailable>
} = dual(
  2,
  (log: Reservation.Log.ReservationLogService, orderId: string) =>
    Effect.map(log.findReservation(orderId), reservationViewOf),
)

export const rollbackAuditOf = (audit: {
  readonly orderId: string
  readonly actorId: string
}): Fulfillment.Event.AuditPayload =>
  new Fulfillment.Event.AuditPayload({
    orderId: audit.orderId,
    actorId: audit.actorId,
    decisionTag: 'ConflictRollback',
    occurredAt,
  })

export const rollbackRowsOf: {
  (orderId: string): (db: Persistence.DrizzleSession.DrizzleDatabase) => Effect.Effect<number>
  (db: Persistence.DrizzleSession.DrizzleDatabase, orderId: string): Effect.Effect<number>
} = dual(
  2,
  (db: Persistence.DrizzleSession.DrizzleDatabase, orderId: string) =>
    Effect.map(
      db.select().from(Persistence.Tables.auditEvents).where(eq(Persistence.Tables.auditEvents.orderId, orderId)),
      (rows) => rows.length,
    ).pipe(Effect.orDie),
)
