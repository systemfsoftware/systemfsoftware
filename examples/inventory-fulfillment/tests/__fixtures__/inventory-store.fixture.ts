import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Fulfillment, Inventory, Persistence } from '@systemfsoftware/example-inventory-fulfillment'
import { Array as Arr, Effect, Layer, Option, Order, Schema as S } from 'effect'
import { dual } from 'effect/Function'

export const CENTRAL_WAREHOUSE = 'warehouse-central'
export const NORTH_WAREHOUSE = 'warehouse-north'

export const inventorySeed = (): Inventory.Memory.InventoryStoreSeed => ({
  warehouses: [
    { warehouseId: CENTRAL_WAREHOUSE, region: 'central' },
    { warehouseId: NORTH_WAREHOUSE, region: 'north' },
  ],
  lots: [
    { lotId: 'lot-kettle-a', sku: 'sku-kettle', warehouseId: CENTRAL_WAREHOUSE, quantityOnHand: 5, version: 1 },
    { lotId: 'lot-kettle-b', sku: 'sku-kettle', warehouseId: CENTRAL_WAREHOUSE, quantityOnHand: 6, version: 2 },
    { lotId: 'lot-teapot-a', sku: 'sku-teapot', warehouseId: CENTRAL_WAREHOUSE, quantityOnHand: 7, version: 3 },
    { lotId: 'lot-mug-a', sku: 'sku-mug', warehouseId: NORTH_WAREHOUSE, quantityOnHand: 8, version: 4 },
    { lotId: 'lot-teapot-north', sku: 'sku-teapot', warehouseId: NORTH_WAREHOUSE, quantityOnHand: 9, version: 5 },
  ],
})

const seedPostgres = Effect.gen(function*() {
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const seed = inventorySeed()
  yield* db.insert(Persistence.Tables.warehouses).values(
    Arr.map(seed.warehouses, (warehouse) => ({ id: warehouse.warehouseId, region: warehouse.region })),
  ).onConflictDoNothing()
  yield* db.insert(Persistence.Tables.stockLots).values(
    Arr.map(seed.lots, (lot) => ({
      id: lot.lotId,
      sku: lot.sku,
      warehouseId: lot.warehouseId,
      quantityOnHand: lot.quantityOnHand,
      version: lot.version,
      expiresAt: null,
    })),
  ).onConflictDoNothing()
})

export const inventoryStoreWorld: Layer.Layer<Persistence.DrizzleSession.DrizzleSession> = Persistence.DrizzleSession
  .layerTest.pipe(Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)))

export const acrossInventoryStores = <A, E>(
  law: Effect.Effect<A, E, Inventory.Store.InventoryStore>,
): Effect.Effect<{ readonly memory: A; readonly postgres: A }, E, Persistence.DrizzleSession.DrizzleSession> =>
  Effect.gen(function*() {
    const memory = yield* Effect.provide(law, Inventory.Memory.layer(inventorySeed()))
    yield* Effect.orDie(seedPostgres)
    const postgres = yield* Effect.provide(law, Inventory.Drizzle.layer)
    return { memory, postgres }
  })

export interface StockLotView {
  readonly warehouseId: string
  readonly region: string
  readonly lotId: string
  readonly sku: string
  readonly quantityOnHand: number
  readonly version: number
}

export interface StockView {
  readonly lots: readonly StockLotView[]
  readonly nextCursor: string | null
}

const byLotKey: Order.Order<StockLotView> = Order.combine(
  Order.mapInput(Order.String, (lot: StockLotView) => lot.sku),
  Order.mapInput(Order.String, (lot: StockLotView) => lot.lotId),
)

export const stockViewOf = (page: Inventory.Store.StockPage): StockView => ({
  lots: Arr.sort(
    Arr.flatMap(page.partitions, (partition) =>
      Arr.map(partition.lots, (lot) => ({
        warehouseId: partition.warehouseId,
        region: partition.region,
        lotId: lot.lotId,
        sku: lot.sku,
        quantityOnHand: lot.quantityOnHand,
        version: lot.version,
      }))),
    byLotKey,
  ),
  nextCursor: Option.getOrNull(page.nextCursor),
})

export interface StockQuery {
  readonly limit: number
  readonly warehouseId: Option.Option<string>
}

const walkFrom = (
  store: Inventory.Store.InventoryStoreService,
  query: StockQuery,
  cursor: Option.Option<Inventory.Schema.StockPosition>,
  collected: readonly StockLotView[],
): Effect.Effect<StockView, Fulfillment.Decision.StoreUnavailable> =>
  Effect.flatMap(
    store.readStockPage({ cursor, limit: query.limit, warehouseId: query.warehouseId }),
    (page) => {
      const lots = [...collected, ...stockViewOf(page).lots]
      return Option.match(page.nextCursor, {
        onNone: () => Effect.succeed<StockView>({ lots, nextCursor: null }),
        onSome: (next) =>
          Effect.flatMap(
            S.decodeEffect(Inventory.Schema.StockCursor)(next).pipe(Effect.orDie),
            (position) => walkFrom(store, query, Option.some(position), lots),
          ),
      })
    },
  )

export const walkStock: {
  (query: StockQuery): (
    store: Inventory.Store.InventoryStoreService,
  ) => Effect.Effect<StockView, Fulfillment.Decision.StoreUnavailable>
  (
    store: Inventory.Store.InventoryStoreService,
    query: StockQuery,
  ): Effect.Effect<StockView, Fulfillment.Decision.StoreUnavailable>
} = dual(
  2,
  (store: Inventory.Store.InventoryStoreService, query: StockQuery) => walkFrom(store, query, Option.none(), []),
)
