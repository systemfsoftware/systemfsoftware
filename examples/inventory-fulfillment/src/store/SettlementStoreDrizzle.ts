import { asc, eq, inArray, sql } from 'drizzle-orm'
import { Array as Arr, Cause, Context, DateTime, Effect, Layer, Match, Option, Schedule } from 'effect'
import type { Duration as DurationTime } from 'effect'
import { CreditAccountNotFound, StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { LotAllocation, WarehouseStockPartition } from '../inventory/inventory.schema.js'
import type { OrderKey, OrderPlan } from '../ports/SettlementStore.service.js'
import { SettlementStore, UnitOfWork } from '../ports/SettlementStore.service.js'
import { decodeCreditAccount, decodeCustomerTier } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { auditEvents, reservations, stockLots, user } from './schema.tables.js'
import { partitionsFor, type StockLotRow } from './stockPartitions.js'

export interface RetryBudget {
  readonly attempts: number
  readonly baseInterval: DurationTime.Input
  readonly maxInterval: DurationTime.Input
}

type Tx = Parameters<Parameters<DrizzleDatabase['transaction']>[0]>[0]

class OpenTransaction extends Context.Service<OpenTransaction, Tx>()(
  '@systemfsoftware/example-inventory-fulfillment/store/SettlementStoreDrizzle/OpenTransaction',
) {}

const unitProvidedElsewhere = new Error(
  'UnitOfWork was provided by something other than SettlementStore.unitOfWork',
)

const inTransaction = <A, E>(use: (tx: Tx) => Effect.Effect<A, E>): Effect.Effect<A, E, UnitOfWork> =>
  Effect.gen(function*() {
    yield* UnitOfWork
    return yield* Effect.flatMap(
      Effect.serviceOption(OpenTransaction),
      Option.match({ onNone: () => Effect.die(unitProvidedElsewhere), onSome: use }),
    )
  })

type UserRow = typeof user.$inferSelect

const accountRowOf = (row: UserRow) => ({
  customerId: row.id,
  creditLimit: row.creditLimit,
  outstandingBalance: row.outstandingBalance,
  overdraftPrivilege: row.overdraftPrivilege,
})

const lotsOf = (tx: Tx, skus: readonly string[]) =>
  Arr.isReadonlyArrayEmpty(skus)
    ? Effect.succeed<readonly StockLotRow[]>([])
    : tx.select().from(stockLots).where(inArray(stockLots.sku, [...skus])).orderBy(asc(stockLots.id))

const load = (tx: Tx, key: OrderKey) =>
  Effect.gen(function*() {
    const rows: readonly UserRow[] = yield* tx.select().from(user).where(eq(user.id, key.customerId))
    const row: UserRow = yield* Effect.fromOption(
      Option.fromUndefinedOr(rows[0]),
      () =>
        new CreditAccountNotFound({
          customerId: key.customerId,
          reason: `no credit account for customer ${key.customerId}`,
        }),
    )
    const account = yield* decodeCreditAccount(accountRowOf(row))
    const tier = yield* decodeCustomerTier(row.tier)
    const lots = yield* lotsOf(tx, key.skus)
    const stock: readonly WarehouseStockPartition[] = yield* partitionsFor(tx, lots)
    const reserved: readonly { readonly customerId: string }[] = yield* tx
      .select({ customerId: reservations.customerId })
      .from(reservations)
      .where(eq(reservations.orderId, key.orderId))
      .limit(1)
    return {
      account,
      tier,
      stock,
      reservedBy: Option.map(Option.fromUndefinedOr(reserved[0]), (first) => first.customerId),
    }
  }).pipe(Effect.catchTags({
    SchemaError: (cause) => Effect.fail(new StoreUnavailable({ cause })),
    EffectDrizzleQueryError: (cause) => Effect.fail(new StoreUnavailable({ cause })),
  }))

const allocationsOf = (events: readonly InventoryReservationEvents[]): readonly LotAllocation[] =>
  Arr.flatMap(events, (event) =>
    Match.value(event).pipe(
      Match.tag('StockReserved', ({ allocations }) => allocations),
      Match.tag('BackorderRecorded', () => Arr.empty()),
      Match.exhaustive,
    ))

/** Plain writes. No guard, no version: the transaction's isolation level is the only concurrency control. */
const settle = (tx: Tx, plan: OrderPlan) =>
  Effect.gen(function*() {
    yield* Option.match(plan.charge, {
      onNone: () => Effect.void,
      onSome: (amount) =>
        tx.update(user)
          .set({ outstandingBalance: sql`${user.outstandingBalance} + ${amount}` })
          .where(eq(user.id, plan.customerId)),
    })
    yield* Effect.forEach(
      allocationsOf(plan.events),
      (allocation) =>
        Effect.andThen(
          tx.update(stockLots)
            .set({ quantityOnHand: sql`${stockLots.quantityOnHand} - ${allocation.quantity}` })
            .where(eq(stockLots.id, allocation.lotId)),
          tx.insert(reservations).values({
            id: `${plan.orderId}:${allocation.lotId}`,
            orderId: plan.orderId,
            customerId: plan.customerId,
            sku: allocation.sku,
            warehouseId: allocation.warehouseId,
            lotId: allocation.lotId,
            quantity: allocation.quantity,
            version: 0,
            occurredAt: DateTime.toDate(plan.audit.occurredAt),
          }),
        ),
      { discard: true },
    )
    yield* tx.insert(auditEvents).values({
      id: `${plan.audit.orderId}:audit`,
      orderId: plan.audit.orderId,
      actorId: plan.audit.actorId,
      decisionTag: plan.audit.decisionTag,
      occurredAt: DateTime.toDate(plan.audit.occurredAt),
    })
  }).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

const stringOnly = <T>(value: T): string | undefined => typeof value === 'string' ? value : undefined

const fieldCode = (value: string | undefined): ReadonlyArray<string> => value === undefined ? [] : [value]

const directCodes = (error: object): ReadonlyArray<string> =>
  fieldCode('code' in error ? stringOnly(error.code) : undefined)

const causeOrUndefined = (error: object) => 'cause' in error ? error.cause : undefined

const causedCodes = <T>(error: T, depth: number): ReadonlyArray<string> =>
  Match.value(shallow(error) ? causeOrUndefined(error) : undefined).pipe(
    Match.when(undefined, () => []),
    Match.when(null, () => []),
    Match.orElse((cause) => codesOf(cause, depth)),
  )

const reasonCodes = <E>(reason: Cause.Reason<E>, depth: number): ReadonlyArray<string> =>
  Match.value(reason).pipe(
    Match.when(Cause.isFailReason, (failure) => codesOf(failure.error, depth)),
    Match.when(Cause.isDieReason, (died) => codesOf(died.defect, depth)),
    Match.orElse(() => []),
  )

const deepReasons = <T>(error: T, depth: number): ReadonlyArray<string> =>
  Cause.isCause(error) ? Arr.flatMap(error.reasons, (reason) => reasonCodes(reason, depth)) : []

const shallow = <T>(error: T): error is T & object => typeof error === 'object' && error !== null

const deepCodes = <T>(error: T, depth: number): ReadonlyArray<string> =>
  shallow(error)
    ? [...directCodes(error), ...causedCodes(error, depth + 1), ...deepReasons(error, depth + 1)]
    : []

const codesOf = <T>(error: T, depth: number): ReadonlyArray<string> => depth > 10 ? [] : deepCodes(error, depth)

/** The Postgres SQLSTATE codes a failure's cause chain names, through `.cause` fields and Effect `Cause` reasons. */
export const sqlStatesOf = <T>(failure: T): ReadonlyArray<string> => Arr.dedupe(codesOf(failure, 0))

/** Postgres asks for a whole-unit re-run on 40001 and 40P01 only (§13.5). */
const retryState = (state: string): boolean => state === '40001' || state === '40P01'

const retryable = <T>(error: T): boolean => Arr.some(sqlStatesOf(error), retryState)

export const layer = (budget: RetryBudget): Layer.Layer<SettlementStore, never, DrizzleSession> =>
  Layer.effect(
    SettlementStore,
    Effect.gen(function*() {
      const db = yield* DrizzleSession
      const backoff = Schedule.min([
        Schedule.exponential(budget.baseInterval).pipe(Schedule.jittered),
        Schedule.spaced(budget.maxInterval),
      ])
      return {
        load: (key: OrderKey) => inTransaction((tx) => load(tx, key)),
        settle: (plan: OrderPlan) => inTransaction((tx) => settle(tx, plan)),
        unitOfWork: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          db.transaction(
            (tx) =>
              effect.pipe(
                Effect.provideService(UnitOfWork, { open: true }),
                Effect.provideService(OpenTransaction, tx),
              ),
            { isolationLevel: 'serializable' },
          ).pipe(
            Effect.retry({
              while: (error) => retryable(error),
              times: Math.max(0, budget.attempts - 1),
              schedule: backoff,
            }),
            Effect.catchTag('SqlError', (cause) => Effect.fail(new StoreUnavailable({ cause }))),
          ),
      }
    }),
  )
