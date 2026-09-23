import * as Pglite from '@effect/sql-pglite/PgliteClient'
import {
  auditEvents,
  DrizzleSession,
  Fulfillment,
  Inventory,
  reservations,
  SettlementStore,
  stockLots,
  user,
  warehouses,
} from '@systemfsoftware/example-inventory-fulfillment'
import type {
  CreditObservation,
  CreditProof,
  SettlementCommand,
  SettlementStoreSeed,
  SettlementStoreService,
  StockObservation,
  StockProof,
} from '@systemfsoftware/example-inventory-fulfillment'
import { DateTime, Effect, Layer, Option, Result, Schema as S } from 'effect'
import { dual } from 'effect/Function'

export const FIRST_CUSTOMER = 'customer-one'
export const SECOND_CUSTOMER = 'customer-two'
export const FIRST_LOT = 'lot-teapot'
export const SECOND_LOT = 'lot-kettle'
export const FIRST_SKU = 'sku-teapot'
export const SECOND_SKU = 'sku-kettle'

export const settlementSeed = (): SettlementStoreSeed => ({
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

export const settlementStoreWorld: Layer.Layer<DrizzleSession> = DrizzleSession.Test.pipe(
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

const seedPostgres = Effect.gen(function*() {
  const db = yield* DrizzleSession
  const at = DateTime.toDate(DateTime.makeUnsafe('2026-01-01T00:00:00.000Z'))
  yield* db.insert(warehouses).values({ id: 'warehouse-central', region: 'central' }).onConflictDoNothing()
  yield* db.insert(stockLots).values([
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
  yield* db.insert(user).values([
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
const resetPostgres = Effect.gen(function*() {
  const db = yield* DrizzleSession
  yield* Effect.orDie(seedPostgres)
  yield* db.delete(auditEvents).pipe(Effect.orDie, Effect.asVoid)
  yield* db.delete(reservations).pipe(Effect.orDie, Effect.asVoid)
  yield* db.update(stockLots).set({ quantityOnHand: 10, version: 1 }).pipe(Effect.orDie, Effect.asVoid)
  yield* db.update(user).set({ outstandingBalance: 0 }).pipe(Effect.orDie, Effect.asVoid)
})

/** Runs one law against both adapters and reports what each of them answered. */
export const acrossStores = <A, E>(
  law: Effect.Effect<A, E, SettlementStore>,
): Effect.Effect<{ readonly memory: A; readonly postgres: A }, E, DrizzleSession> =>
  Effect.gen(function*() {
    const memory = yield* Effect.provide(law, SettlementStore.memory(settlementSeed()))
    yield* resetPostgres
    const postgres = yield* Effect.provide(law, SettlementStore.Live)
    return { memory, postgres }
  })

export const readCreditOf: {
  (customerId: string): (store: SettlementStoreService) => Effect.Effect<CreditObservation>
  (store: SettlementStoreService, customerId: string): Effect.Effect<CreditObservation>
} = dual(2, (store: SettlementStoreService, customerId: string) => Effect.orDie(store.readCredit(customerId)))

export const lotVersionOf: {
  (lotId: string): (stock: StockObservation) => number
  (stock: StockObservation, lotId: string): number
} = dual(2, (stock: StockObservation, lotId: string) => lotStateOf(stock, lotId).version)

export const lotQuantityOf: {
  (lotId: string): (stock: StockObservation) => number
  (stock: StockObservation, lotId: string): number
} = dual(2, (stock: StockObservation, lotId: string) => lotStateOf(stock, lotId).quantityOnHand)

const lotStateOf = (stock: StockObservation, lotId: string) => {
  const lot = Option.fromUndefinedOr(
    stock.partitions.flatMap((partition) => partition.lots).find((lot) => lot.lotId === lotId),
  )
  return Result.getOrThrow(Option.match(lot, {
    onNone: () => Result.fail(new Error(`the read holds no lot ${lotId}`)),
    onSome: (found) => Result.succeed(found),
  }))
}

export interface SettlementAttempt {
  readonly orderId: string
  readonly customerId: string
  readonly sku: string
  readonly lotId: string
  readonly quantity: number
  readonly charge: number
  readonly observedLotVersion: number
  readonly creditProof: CreditProof
  readonly stockProof: StockProof
}

const attemptOccurredAt = DateTime.makeUnsafe('2026-01-01T00:00:00.000Z')

const moneyOf = (value: number): Fulfillment.Credit.Money =>
  Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(value))

export const settlementCommandOf = (attempt: SettlementAttempt): SettlementCommand => ({
  orderId: attempt.orderId,
  customerId: attempt.customerId,
  events: [
    new Fulfillment.Event.StockReserved({
      orderId: attempt.orderId,
      allocations: [
        Result.getOrThrow(
          S.decodeResult(Inventory.Schema.LotAllocation)({
            warehouseId: 'warehouse-central',
            lotId: attempt.lotId,
            sku: attempt.sku,
            quantity: attempt.quantity,
            version: attempt.observedLotVersion,
          }),
        ),
      ],
      occurredAt: attemptOccurredAt,
    }),
  ],
  audit: new Fulfillment.Event.AuditPayload({
    orderId: attempt.orderId,
    actorId: attempt.customerId,
    decisionTag: 'AllocatedSplit',
    occurredAt: attemptOccurredAt,
  }),
  stock: attempt.stockProof,
  charge: Option.some({ amount: moneyOf(attempt.charge), proof: attempt.creditProof }),
})
