import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Fulfillment, Inventory, Persistence, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { DateTime, Duration, Effect, Layer, Option, Result, Schema as S } from 'effect'
import { dual } from 'effect/Function'
import { armSeamAlways, armSeamOnce, disarmSeam, serializationSeamLayer } from './serialization-seam.fixture.js'

export { armSeamAlways, armSeamOnce, disarmSeam, serializationSeamLayer }

export const FIRST_CUSTOMER = 'customer-one'
export const SECOND_CUSTOMER = 'customer-two'
export const FIRST_LOT = 'lot-teapot'
export const SECOND_LOT = 'lot-kettle'
export const FIRST_SKU = 'sku-teapot'
export const SECOND_SKU = 'sku-kettle'

export const settlementSeed = (): Settlement.Store.SettlementStoreSeed => ({
  warehouses: [{ warehouseId: 'warehouse-central', region: 'central' }],
  lots: [
    { lotId: FIRST_LOT, sku: FIRST_SKU, warehouseId: 'warehouse-central', quantityOnHand: 10, version: 1 },
    { lotId: SECOND_LOT, sku: SECOND_SKU, warehouseId: 'warehouse-central', quantityOnHand: 10, version: 1 },
  ],
  customers: [
    {
      customerId: FIRST_CUSTOMER,
      tier: 'Standard',
      creditLimit: 100,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
    {
      customerId: SECOND_CUSTOMER,
      tier: 'Standard',
      creditLimit: 100,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
  ],
})

export const standardBudget: Settlement.Drizzle.RetryBudget = {
  attempts: 30,
  baseInterval: Duration.millis(2),
  maxInterval: Duration.millis(100),
}

export const exhaustedBudget: Settlement.Drizzle.RetryBudget = {
  attempts: 3,
  baseInterval: Duration.millis(1),
  maxInterval: Duration.millis(10),
}

const pgliteSession = Persistence.DrizzleSession.layerTest.pipe(
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

export const settlementStoreWorld: Layer.Layer<Persistence.DrizzleSession.DrizzleSession> = Layer.mergeAll(
  pgliteSession,
  serializationSeamLayer.pipe(Layer.provide(pgliteSession)),
)

const seedPostgres = Effect.gen(function*() {
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const at = DateTime.toDate(DateTime.makeUnsafe('2026-01-01T00:00:00.000Z'))
  yield* db.insert(Persistence.Tables.warehouses).values({ id: 'warehouse-central', region: 'central' })
    .onConflictDoNothing()
  yield* db.insert(Persistence.Tables.stockLots).values([
    {
      id: FIRST_LOT,
      sku: FIRST_SKU,
      warehouseId: 'warehouse-central',
      quantityOnHand: 10,
      version: 1,
      expiresAt: null,
    },
    {
      id: SECOND_LOT,
      sku: SECOND_SKU,
      warehouseId: 'warehouse-central',
      quantityOnHand: 10,
      version: 1,
      expiresAt: null,
    },
  ]).onConflictDoNothing()
  yield* db.insert(Persistence.Tables.user).values([
    {
      id: FIRST_CUSTOMER,
      name: 'Customer One',
      email: 'customer-one@example.test',
      emailVerified: true,
      createdAt: at,
      updatedAt: at,
      tier: 'Standard',
      creditLimit: 100,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
    {
      id: SECOND_CUSTOMER,
      name: 'Customer Two',
      email: 'customer-two@example.test',
      emailVerified: true,
      createdAt: at,
      updatedAt: at,
      tier: 'Standard',
      creditLimit: 100,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
  ]).onConflictDoNothing()
})

export const resetPostgres = Effect.gen(function*() {
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  yield* Effect.orDie(seedPostgres)
  yield* db.delete(Persistence.Tables.auditEvents).pipe(Effect.orDie, Effect.asVoid)
  yield* db.delete(Persistence.Tables.reservations).pipe(Effect.orDie, Effect.asVoid)
  yield* db.update(Persistence.Tables.stockLots).set({ quantityOnHand: 10, version: 1 }).pipe(
    Effect.orDie,
    Effect.asVoid,
  )
  yield* db.update(Persistence.Tables.user).set({
    outstandingBalance: 0,
    creditLimit: 100,
    overdraftPrivilege: 0,
    tier: 'Standard',
  }).pipe(Effect.orDie, Effect.asVoid)
  yield* disarmSeam
})

/** Runs one law against both adapters and reports what each of them answered. */
export const acrossStores = <A, E>(
  law: Effect.Effect<
    A,
    E,
    Settlement.Store.SettlementStore | Persistence.DrizzleSession.DrizzleSession
  >,
): Effect.Effect<
  { readonly memory: A; readonly postgres: A },
  E,
  Persistence.DrizzleSession.DrizzleSession
> =>
  Effect.gen(function*() {
    const memory = yield* Effect.provide(law, Settlement.Memory.layer(settlementSeed()))
    yield* resetPostgres
    const postgres = yield* Effect.provide(law, Settlement.Drizzle.layer(standardBudget))
    return { memory, postgres }
  })

export interface OrderInput {
  readonly orderId: string
  readonly customerId: string
  readonly sku: string
  readonly lotId: string
  readonly quantity: number
  readonly charge: number | undefined
}

export const keyOf = (input: OrderInput): Settlement.Unit.OrderKey => ({
  orderId: input.orderId,
  customerId: input.customerId,
  skus: [input.sku],
})

const attemptOccurredAt = DateTime.makeUnsafe('2026-01-01T00:00:00.000Z')

const moneyOf = (value: number): Fulfillment.Credit.Money =>
  Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(value))

const allocationOf = (input: OrderInput) =>
  Result.getOrThrow(
    S.decodeResult(Inventory.Schema.LotAllocation)({
      warehouseId: 'warehouse-central',
      lotId: input.lotId,
      sku: input.sku,
      quantity: input.quantity,
    }),
  )

export const planOf = (input: OrderInput): Settlement.Unit.OrderPlan => ({
  orderId: input.orderId,
  customerId: input.customerId,
  charge: input.charge === undefined ? Option.none() : Option.some(moneyOf(input.charge)),
  events: [
    Fulfillment.Event.StockReserved.make({
      orderId: input.orderId,
      allocations: [allocationOf(input)],
      occurredAt: attemptOccurredAt,
    }),
  ],
  audit: Fulfillment.Event.AuditPayload.make({
    orderId: input.orderId,
    actorId: input.customerId,
    decisionTag: 'AllocatedSplit',
    occurredAt: attemptOccurredAt,
  }),
})

export const settleInUnit: {
  (input: OrderInput): (
    store: Settlement.Store.SettlementStoreService,
  ) => Effect.Effect<void, Settlement.Unit.SettlementFailure>
  (
    store: Settlement.Store.SettlementStoreService,
    input: OrderInput,
  ): Effect.Effect<void, Settlement.Unit.SettlementFailure>
} = dual(
  2,
  (store: Settlement.Store.SettlementStoreService, input: OrderInput) =>
    store.unitOfWork((unit) =>
      Effect.flatMap(Settlement.Unit.load(unit, keyOf(input)), () => Settlement.Unit.settle(unit, planOf(input)))
    ),
)

export const snapshotInUnit: {
  (input: OrderInput): (
    store: Settlement.Store.SettlementStoreService,
  ) => Effect.Effect<Settlement.Unit.OrderSnapshot, Settlement.Unit.SettlementFailure>
  (
    store: Settlement.Store.SettlementStoreService,
    input: OrderInput,
  ): Effect.Effect<Settlement.Unit.OrderSnapshot, Settlement.Unit.SettlementFailure>
} = dual(
  2,
  (store: Settlement.Store.SettlementStoreService, input: OrderInput) =>
    store.unitOfWork(Settlement.Unit.load(keyOf(input))),
)

export const lotQuantityOf: {
  (lotId: string): (stock: Settlement.Unit.OrderSnapshot['stock']) => number
  (stock: Settlement.Unit.OrderSnapshot['stock'], lotId: string): number
} = dual(
  2,
  (stock: Settlement.Unit.OrderSnapshot['stock'], lotId: string) => lotStateOf(stock, lotId).quantityOnHand,
)

const lotStateOf = (stock: Settlement.Unit.OrderSnapshot['stock'], lotId: string) => {
  const lot = Option.fromUndefinedOr(
    stock.flatMap((partition) => partition.lots).find((lot) => lot.lotId === lotId),
  )
  return Result.getOrThrow(Option.match(lot, {
    onNone: () => Result.fail(new Error(`the read holds no lot ${lotId}`)),
    onSome: (found) => Result.succeed(found),
  }))
}

export const outstandingOf: {
  (customerId: string): (db: Persistence.DrizzleSession.DrizzleDatabase) => Effect.Effect<number>
  (db: Persistence.DrizzleSession.DrizzleDatabase, customerId: string): Effect.Effect<number>
} = dual(
  2,
  (db: Persistence.DrizzleSession.DrizzleDatabase, customerId: string): Effect.Effect<number> =>
    Effect.map(
      db.select().from(Persistence.Tables.user).where(eq(Persistence.Tables.user.id, customerId)).pipe(Effect.orDie),
      (rows) =>
        Result.getOrThrow(Option.match(Option.fromUndefinedOr(rows[0]), {
          onNone: () => Result.fail(new Error(`no credit account ${customerId}`)),
          onSome: (row) => Result.succeed(row.outstandingBalance),
        })),
    ),
)

export const reservationsOf: {
  (orderId: string): (db: Persistence.DrizzleSession.DrizzleDatabase) => Effect.Effect<number>
  (db: Persistence.DrizzleSession.DrizzleDatabase, orderId: string): Effect.Effect<number>
} = dual(
  2,
  (db: Persistence.DrizzleSession.DrizzleDatabase, orderId: string): Effect.Effect<number> =>
    Effect.map(
      db.select().from(Persistence.Tables.reservations).where(
        eq(Persistence.Tables.reservations.orderId, orderId),
      ).pipe(Effect.orDie),
      (rows) => rows.length,
    ),
)

export const auditsOf: {
  (orderId: string): (db: Persistence.DrizzleSession.DrizzleDatabase) => Effect.Effect<number>
  (db: Persistence.DrizzleSession.DrizzleDatabase, orderId: string): Effect.Effect<number>
} = dual(
  2,
  (db: Persistence.DrizzleSession.DrizzleDatabase, orderId: string): Effect.Effect<number> =>
    Effect.map(
      db.select().from(Persistence.Tables.auditEvents).where(eq(Persistence.Tables.auditEvents.orderId, orderId))
        .pipe(Effect.orDie),
      (rows) => rows.length,
    ),
)
