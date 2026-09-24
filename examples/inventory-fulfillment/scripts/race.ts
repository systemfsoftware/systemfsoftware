import { NodeRuntime } from '@effect/platform-node'
import { layer as pgClientLayer } from '@effect/sql-pg/PgClient'
import { Fulfillment, Inventory, Persistence, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { count, eq, sql, sum } from 'drizzle-orm'
import {
  Array as Arr,
  Config,
  Console,
  Context,
  Duration,
  Effect,
  Layer,
  Redacted,
  Ref,
  Result,
  Schema as S,
} from 'effect'

const scenario = { quantity: 20, creditLimit: 100, skus: 2, lotQuantity: 100, customerId: 'race-customer' } as const

class InvariantBroken extends S.TaggedError<InvariantBroken>()('InvariantBroken', {
  message: S.String,
}) {}

const settings = Effect.all({
  databaseUrl: Config.String('DATABASE_URL'),
  instances: Config.Int('INSTANCES').pipe(Config.withDefault(2)),
  orders: Config.Int('ORDERS').pipe(Config.withDefault(10)),
  attempts: Config.Int('SETTLEMENT_RETRY_ATTEMPTS').pipe(Config.withDefault(30)),
  baseIntervalMs: Config.Int('SETTLEMENT_RETRY_BASE_INTERVAL_MS').pipe(Config.withDefault(2)),
  maxIntervalMs: Config.Int('SETTLEMENT_RETRY_MAX_INTERVAL_MS').pipe(Config.withDefault(100)),
}).pipe(Effect.orDie)

/** One app instance: its own connection pool and its own settlement store. */
const sessionFor = (databaseUrl: string) =>
  Persistence.DrizzleSession.layer.pipe(Layer.provideMerge(pgClientLayer({ url: Redacted.make(databaseUrl) })))

const requestOf = (index: number): Effect.Effect<Fulfillment.Cell.PlaceOrderRequest> =>
  Effect.map(
    S.decodeEffect(Inventory.Schema.SkuId)(`RACE-SKU-${(index % scenario.skus) + 1}`),
    (sku) => ({
      orderId: `race-order-${String(index).padStart(3, '0')}`,
      customerId: scenario.customerId,
      lines: [new Fulfillment.Order.OrderLine({ sku, quantity: scenario.quantity })],
      kits: [],
    }),
  ).pipe(Effect.orDie)

const seed = (db: Persistence.DrizzleSession.DrizzleDatabase) =>
  Effect.gen(function*() {
    const { stockLots, user, warehouses } = Persistence.Tables
    yield* db.execute(sql`TRUNCATE reservations, audit_events, stock_lots, warehouses, "user" CASCADE`)
    yield* db.insert(warehouses).values({ id: 'race-warehouse', region: 'east' })
    yield* db.insert(stockLots).values(Arr.map(Arr.range(1, scenario.skus), (n) => ({
      id: `race-lot-${n}`,
      sku: `RACE-SKU-${n}`,
      warehouseId: 'race-warehouse',
      quantityOnHand: scenario.lotQuantity,
      version: 1,
      expiresAt: null,
    })))
    const now = new Date()
    yield* db.insert(user).values({
      id: scenario.customerId,
      name: 'Race Customer',
      email: 'race@example.test',
      createdAt: now,
      updatedAt: now,
      tier: 'Standard',
      creditLimit: scenario.creditLimit,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    })
  }).pipe(Effect.orDie)

const totalsOf = (db: Persistence.DrizzleSession.DrizzleDatabase) =>
  Effect.gen(function*() {
    const { auditEvents, reservations, stockLots, user } = Persistence.Tables
    const credit = yield* db.select({ outstanding: user.outstandingBalance }).from(user).where(
      eq(user.id, scenario.customerId),
    )
    const stock = yield* db.select({ onHand: sum(stockLots.quantityOnHand) }).from(stockLots)
    const reserved = yield* db.select({ units: sum(reservations.quantity) }).from(reservations)
    const audits = yield* db.select({ rows: count() }).from(auditEvents)
    return {
      outstanding: credit[0]?.outstanding ?? 0,
      onHand: Number(stock[0]?.onHand ?? 0),
      reserved: Number(reserved[0]?.units ?? 0),
      audits: audits[0]?.rows ?? 0,
    }
  }).pipe(Effect.orDie)

const granted: Record<string, true> = { AllocatedSplit: true, AllocatedWithOverdraft: true }
const committed: Record<string, true> = {
  AllocatedSplit: true,
  AllocatedWithOverdraft: true,
  Backordered: true,
  CreditHold: true,
}
const race = Effect.gen(function*() {
  const { databaseUrl, instances, orders, attempts, baseIntervalMs, maxIntervalMs } = yield* settings
  const budget = {
    attempts,
    baseInterval: Duration.millis(baseIntervalMs),
    maxInterval: Duration.millis(maxIntervalMs),
  }
  const db = Context.get(yield* Layer.build(sessionFor(databaseUrl)), Persistence.DrizzleSession.DrizzleSession)
  yield* seed(db)
  const transactions = yield* Ref.make(0)
  const stores = yield* Effect.forEach(
    Arr.range(1, instances),
    () => Layer.build(Settlement.Drizzle.layer(budget).pipe(Layer.provide(sessionFor(databaseUrl)))),
  )
  const submit = (
    request: Fulfillment.Cell.PlaceOrderRequest,
    store: Context.Context<Settlement.Store.SettlementStore>,
  ) =>
    Effect.gen(function*() {
      const settlement = yield* Settlement.Store.SettlementStore
      return yield* settlement.unitOfWork((unit) =>
        Ref.update(transactions, (n) => n + 1).pipe(
          Effect.andThen(Fulfillment.Cell.placeOrderCell(unit).run(request)),
        )
      )
    }).pipe(
      Effect.match({ onSuccess: (decision) => decision._tag, onFailure: (error) => error._tag }),
      Effect.provideContext(store),
    )
  const requests = yield* Effect.forEach(Arr.range(0, orders - 1), requestOf)
  const outcomes = yield* Effect.forEach(
    requests,
    (request, index) => submit(request, stores[index % instances] ?? stores[0]!),
    { concurrency: 'unbounded' },
  )
  const after = yield* totalsOf(db)
  const grants = Arr.filter(outcomes, (tag) => granted[tag] === true).length
  const commits = Arr.filter(outcomes, (tag) => committed[tag] === true).length
  const started = yield* Ref.get(transactions)
  const initialStock = scenario.skus * scenario.lotQuantity
  const grantable = Math.min(orders, Math.floor(scenario.creditLimit / scenario.quantity))
  const verdicts = [
    ['every order decided', commits === orders, `decided ${commits} of ${orders}`],
    ['credit filled exactly', grants === grantable, `granted ${grants}, grantable ${grantable}`],
    [
      'credit limit held',
      after.outstanding <= scenario.creditLimit,
      `outstanding ${after.outstanding} of ${scenario.creditLimit}`,
    ],
    [
      'every grant charged once',
      after.outstanding === grants * scenario.quantity,
      `charged ${after.outstanding}, grants x quantity ${grants * scenario.quantity}`,
    ],
    [
      'no stock lost or double-sold',
      after.onHand + after.reserved === initialStock,
      `on hand ${after.onHand} + reserved ${after.reserved} of ${initialStock}`,
    ],
    [
      'reserved units equal charged credit',
      after.reserved === after.outstanding,
      `reserved ${after.reserved}, charged ${after.outstanding}`,
    ],
    ['one audit row per committed order', after.audits === commits, `audit rows ${after.audits}, committed ${commits}`],
  ] as const
  yield* Console.log([
    `${orders} orders x ${scenario.quantity} units from ${instances} instances, credit limit ${scenario.creditLimit}`,
    `outcomes: ${
      Arr.map(Arr.dedupe(outcomes), (tag) => `${tag} ${Arr.filter(outcomes, (other) => other === tag).length}`).join(
        ', ',
      )
    }`,
    `transactions: ${started} for ${orders} orders (${started - orders} re-runs)`,
    ...Arr.map(verdicts, ([label, ok, detail]) => `${ok ? 'ok  ' : 'FAIL'} ${label}: ${detail}`),
  ].join('\n'))
  const failed = Arr.filterMap(verdicts, ([label, ok]) => ok ? Result.failVoid : Result.succeed(label))
  if (failed.length > 0) {
    return yield* new InvariantBroken({ message: `invariants failed: ${failed.join('; ')}` })
  }
})

NodeRuntime.runMain(Effect.scoped(race))
