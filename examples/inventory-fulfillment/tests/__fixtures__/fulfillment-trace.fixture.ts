import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Fulfillment, Persistence, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Contract, Observation, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Context, DateTime, Effect, FileSystem, Layer, Option, Schema as S } from 'effect'
import { dual } from 'effect/Function'
import { armSeamOnce, exhaustedBudget, serializationSeamLayer } from './settlement-store.fixture.js'

const SKU = 'sku-porcelain-mug'
const WAREHOUSE = 'warehouse-north'
const ORDERED_QUANTITY = 2
const STOCKED_QUANTITY = 10
const STANDING_CUSTOMER = 'customer-in-good-standing'
const SKINT_CUSTOMER = 'customer-without-credit'

export interface PlaceOrderInput {
  readonly orderId: string
  readonly customerId: string
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[]
}

export const placeOrderRequest: {
  (customerId: string): (orderId: string) => PlaceOrderInput
  (orderId: string, customerId: string): PlaceOrderInput
} = dual(
  2,
  (orderId: string, customerId: string): PlaceOrderInput => ({
    orderId,
    customerId,
    lines: [{ sku: SKU, quantity: ORDERED_QUANTITY }],
  }),
)

export const placeOrderSeed = (): Settlement.Store.SettlementStoreSeed => ({
  warehouses: [{ warehouseId: WAREHOUSE, region: 'north' }],
  lots: [{ lotId: 'lot-1', sku: SKU, warehouseId: WAREHOUSE, quantityOnHand: STOCKED_QUANTITY, version: 1 }],
  customers: [
    {
      customerId: STANDING_CUSTOMER,
      tier: 'Standard',
      creditLimit: 1000,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
    {
      customerId: SKINT_CUSTOMER,
      tier: 'Standard',
      creditLimit: 0,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
  ],
})

const pgliteSession = Persistence.DrizzleSession.layerTest.pipe(
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

const seedPostgres = (seed: Settlement.Store.SettlementStoreSeed) =>
  Effect.gen(function*() {
    const db = yield* Persistence.DrizzleSession.DrizzleSession
    const at = DateTime.toDate(DateTime.makeUnsafe('2026-01-01T00:00:00.000Z'))
    yield* Effect.forEach(seed.warehouses, (warehouse) =>
      db.insert(Persistence.Tables.warehouses).values({ id: warehouse.warehouseId, region: warehouse.region })
        .onConflictDoNothing(), { discard: true })
    yield* Effect.forEach(seed.lots, (lot) =>
      db.insert(Persistence.Tables.stockLots).values({
        id: lot.lotId,
        sku: lot.sku,
        warehouseId: lot.warehouseId,
        quantityOnHand: lot.quantityOnHand,
        version: lot.version,
        expiresAt: null,
      }).onConflictDoNothing(), { discard: true })
    yield* Effect.forEach(seed.customers, (customer) =>
      db.insert(Persistence.Tables.user).values({
        id: customer.customerId,
        name: customer.customerId,
        email: `${customer.customerId}@example.test`,
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
        tier: customer.tier,
        creditLimit: customer.creditLimit,
        outstandingBalance: customer.outstandingBalance,
        overdraftPrivilege: customer.overdraftPrivilege,
      }).onConflictDoNothing(), { discard: true })
  }).pipe(Effect.orDie)

export class SerializationArms extends Context.Service<SerializationArms, { readonly arm: Effect.Effect<void> }>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/SerializationArms',
) {}

const armedLayer: Layer.Layer<SerializationArms, never, Persistence.DrizzleSession.DrizzleSession> = Layer.effect(
  SerializationArms,
  Effect.map(Effect.serviceOption(Persistence.DrizzleSession.DrizzleSession), (session) =>
    SerializationArms.of({
      arm: Option.match(session, {
        onNone: () => Effect.void,
        onSome: (database) => Effect.provideService(armSeamOnce, Persistence.DrizzleSession.DrizzleSession, database),
      }),
    })),
)

const traceWorld: Layer.Layer<Settlement.Store.SettlementStore | SerializationArms> = Layer.mergeAll(
  Settlement.Drizzle.layer(exhaustedBudget),
  serializationSeamLayer,
  Layer.effectDiscard(seedPostgres(placeOrderSeed())),
  armedLayer,
).pipe(Layer.provide(pgliteSession), Layer.orDie)

const recordingFileSystem = Layer.effect(
  FileSystem.FileSystem,
  Effect.sync(() => {
    const files = new Map<string, string>()
    return FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path, data) =>
        Effect.sync(() => {
          files.set(path, data)
        }),
      readFileString: (path) => Effect.succeed(files.get(path) ?? ''),
    })
  }),
)
export const settlementLayers: Layer.Layer<
  Settlement.Store.SettlementStore | SerializationArms | Observation.Observation | FileSystem.FileSystem
> = Layer.mergeAll(
  traceWorld,
  ObservationWindow.make('inventory-fulfillment').layer,
  recordingFileSystem,
)
const cellRequestOf = (input: PlaceOrderInput): Effect.Effect<Fulfillment.Cell.PlaceOrderRequest> =>
  Effect.map(
    S.decodeEffect(S.Array(Fulfillment.Order.OrderLine))(input.lines).pipe(Effect.orDie),
    (lines) => ({ orderId: input.orderId, customerId: input.customerId, lines, kits: [] }),
  )
const runThroughStore = (input: PlaceOrderInput) =>
  Effect.gen(function*() {
    const store = yield* Settlement.Store.SettlementStore
    const request = yield* cellRequestOf(input)
    return yield* Effect.result(store.unitOfWork((unit) => Fulfillment.Cell.placeOrderCell(unit).run(request)))
  })

const armedRunThroughStore = (request: Fulfillment.Cell.PlaceOrderRequest) =>
  Effect.gen(function*() {
    const arms = yield* SerializationArms
    const store = yield* Settlement.Store.SettlementStore
    yield* arms.arm
    return yield* Effect.result(store.unitOfWork((unit) => Fulfillment.Cell.placeOrderCell(unit).run(request)))
  })

export const settlement = Stimulus.make({
  name: Fulfillment.Taxonomy.PlaceOrder.id,
  run: ({ input }: { readonly input: PlaceOrderInput }) => runThroughStore(input),
})

export const retriedSettlement = Stimulus.make({
  name: Fulfillment.Taxonomy.PlaceOrder.id,
  run: ({ input }: { readonly input: PlaceOrderInput }) => Effect.flatMap(cellRequestOf(input), armedRunThroughStore),
})

export const allocateContract = Contract.of(Fulfillment.Taxonomy.fulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(
    Rel.all(
      Rel.exists(Fulfillment.Taxonomy.PlaceOrder),
      Rel.unique(Fulfillment.Taxonomy.ReservationCommit),
      Rel.unique(Fulfillment.Taxonomy.CreditCharge),
      Rel.fromTaxonomy(Fulfillment.Taxonomy.fulfillmentTaxonomy, { path: 'allocate' }),
    ),
  )
export const creditHoldContract = Contract.of(Fulfillment.Taxonomy.fulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(
    Rel.all(
      Rel.exists(Fulfillment.Taxonomy.PlaceOrder),
      Rel.absent(Fulfillment.Taxonomy.CreditCharge),
      Rel.fromTaxonomy(Fulfillment.Taxonomy.fulfillmentTaxonomy, { path: 'hold' }),
    ),
  )

export const retriedSettlementContract = Contract.of(Fulfillment.Taxonomy.fulfillmentTaxonomy)
  .stimulate(retriedSettlement)
  .holds(
    Rel.all(
      Rel.exists(Fulfillment.Taxonomy.PlaceOrder),
      Rel.not(Rel.unique(Fulfillment.Taxonomy.PlaceOrder)),
      Rel.unique(Fulfillment.Taxonomy.CreditCharge),
      Rel.descendant(Fulfillment.Taxonomy.PlaceOrder, Fulfillment.Taxonomy.ReservationCommit),
      Rel.descendant(Fulfillment.Taxonomy.PlaceOrder, Fulfillment.Taxonomy.CreditCharge),
      Rel.fromTaxonomy(Fulfillment.Taxonomy.fulfillmentTaxonomy, { path: 'allocate' }),
    ),
  )
