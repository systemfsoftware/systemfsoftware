import { Conformance } from '@systemfsoftware/conformance-spec'
import { Fulfillment, Persistence, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Context, DateTime, Duration, Effect, Layer, Option, Ref, Result, Schema as S } from 'effect'
import { creditLedgerModel, LedgerCommand, type LedgerState } from './credit-ledger.model.js'

const LEDGER_CUSTOMERS = ['ada', 'bo'] as const

export class OrderCounter extends Context.Service<OrderCounter, Ref.Ref<number>>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/OrderCounter',
) {}

export const orderCounterLayer: Layer.Layer<OrderCounter> = Layer.effect(OrderCounter, Ref.make(0))

export const ledgerBudget: Settlement.Drizzle.RetryBudget = {
  attempts: 30,
  baseInterval: Duration.millis(2),
  maxInterval: Duration.millis(100),
}

export const ledgerSeed = (): Settlement.Store.SettlementStoreSeed => ({
  warehouses: [],
  lots: [],
  customers: LEDGER_CUSTOMERS.map((customerId) => ({
    customerId,
    tier: 'Standard' as const,
    creditLimit: 1000,
    outstandingBalance: 0,
    overdraftPrivilege: 0,
  })),
})

const seededLedger = Effect.gen(function*() {
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const at = DateTime.toDate(DateTime.makeUnsafe('2026-01-01T00:00:00.000Z'))
  yield* Effect.orDie(db.delete(Persistence.Tables.auditEvents))
  yield* Effect.orDie(db.delete(Persistence.Tables.reservations))
  yield* Effect.orDie(
    db.insert(Persistence.Tables.user).values(
      LEDGER_CUSTOMERS.map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
        tier: 'Standard',
        creditLimit: 1000,
        outstandingBalance: 0,
        overdraftPrivilege: 0,
      })),
    ).onConflictDoUpdate({ target: Persistence.Tables.user.id, set: { outstandingBalance: 0 } }),
  )
})

const nextOrderId: Effect.Effect<string, never, OrderCounter> = Effect.flatMap(
  OrderCounter,
  (counter) => Effect.map(Ref.updateAndGet(counter, (seen) => seen + 1), (seen) => `ledger-order-${seen}`),
)

const planOf = (orderId: string, command: LedgerCommand): Settlement.Unit.OrderPlan => ({
  orderId,
  customerId: command.customer,
  charge: Option.some(Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(command.amount))),
  events: [],
  audit: new Fulfillment.Event.AuditPayload({
    orderId,
    actorId: command.customer,
    decisionTag: 'AllocatedSplit',
    occurredAt: DateTime.makeUnsafe('2026-01-01T00:00:00.000Z'),
  }),
})

export const chargeThroughStore = (
  command: LedgerCommand,
): Effect.Effect<number, Settlement.Unit.SettlementFailure, Settlement.Store.SettlementStore | OrderCounter> =>
  Effect.gen(function*() {
    const store = yield* Settlement.Store.SettlementStore
    const orderId = yield* nextOrderId
    const key = { orderId, customerId: command.customer, skus: [] }
    return yield* store.unitOfWork((unit) =>
      Effect.gen(function*() {
        yield* Settlement.Unit.load(unit, key)
        yield* Settlement.Unit.settle(unit, planOf(orderId, command))
        const after = yield* Settlement.Unit.load(unit, key)
        return after.account.outstandingBalance
      })
    )
  })

export const memoryLedgerLayer: Layer.Layer<Settlement.Store.SettlementStore | OrderCounter> = Layer.mergeAll(
  Settlement.Memory.layer(ledgerSeed()),
  orderCounterLayer,
)

export const drizzleLedgerLayer = (
  session: Context.Context<Persistence.DrizzleSession.DrizzleSession>,
): Layer.Layer<Settlement.Store.SettlementStore | OrderCounter> =>
  Layer.mergeAll(
    Settlement.Drizzle.layer(ledgerBudget),
    Layer.effectDiscard(seededLedger),
    orderCounterLayer,
  ).pipe(Layer.provide(Layer.succeedContext(session)))

export const ledgerSpec: Conformance.Specification<
  LedgerCommand,
  LedgerState,
  number,
  Settlement.Unit.SettlementFailure,
  Settlement.Store.SettlementStore | OrderCounter
> = {
  commands: LedgerCommand,
  model: creditLedgerModel,
  run: chargeThroughStore,
  fibers: 2,
  operations: 4,
  preemptions: 1,
  maxSchedules: 5_000,
}

export const budgetedHistories = 20

export const ledgerSequenceSpec: Conformance.SequentialSpecification<
  LedgerCommand,
  LedgerState,
  number,
  Settlement.Unit.SettlementFailure,
  Settlement.Store.SettlementStore | OrderCounter
> = {
  commands: LedgerCommand,
  model: { ...creditLedgerModel, precondition: () => true },
  run: chargeThroughStore,
  sequences: budgetedHistories,
  operations: 4,
}
