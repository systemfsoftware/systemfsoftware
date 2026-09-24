import { expect } from '@effect/vitest'
import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Inventory } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Option } from 'effect'
import {
  acrossInventoryStores,
  CENTRAL_WAREHOUSE,
  inventoryStoreWorld,
  NORTH_WAREHOUSE,
  type StockView,
  stockViewOf,
  walkStock,
} from './__fixtures__/inventory-store.fixture.js'

const Feature = makeFeature({ it, layer })

type StoreUnavailable = Fulfillment.Decision.StoreUnavailable

const ANY_WAREHOUSE = Option.none<string>()
const onlyCentral = Option.some(CENTRAL_WAREHOUSE)
const onlyNorth = Option.some(NORTH_WAREHOUSE)

const firstPageReadTwice: Effect.Effect<
  { readonly first: StockView; readonly second: StockView },
  StoreUnavailable,
  Inventory.Store.InventoryStore
> = Effect.flatMap(Inventory.Store.InventoryStore, (store) =>
  Effect.gen(function*() {
    const first = yield* store.readStockPage({ cursor: Option.none(), limit: 2, warehouseId: ANY_WAREHOUSE })
    const second = yield* store.readStockPage({ cursor: Option.none(), limit: 2, warehouseId: ANY_WAREHOUSE })
    return { first: stockViewOf(first), second: stockViewOf(second) }
  }))

const bothWarehousesListed: Effect.Effect<
  {
    readonly centralThenNorth: readonly [StockView, StockView]
    readonly northThenCentral: readonly [StockView, StockView]
  },
  StoreUnavailable,
  Inventory.Store.InventoryStore
> = Effect.flatMap(Inventory.Store.InventoryStore, (store) =>
  Effect.gen(function*() {
    const centralThenNorth = yield* Effect.all([
      walkStock(store, { limit: 100, warehouseId: onlyCentral }),
      walkStock(store, { limit: 100, warehouseId: onlyNorth }),
    ])
    const northThenCentral = yield* Effect.all([
      walkStock(store, { limit: 100, warehouseId: onlyNorth }),
      walkStock(store, { limit: 100, warehouseId: onlyCentral }),
    ])
    return { centralThenNorth, northThenCentral }
  }))

const pageSizes: readonly number[] = [1, 2, 3, 100]

const wholeCatalogueWalked: Effect.Effect<
  { readonly walks: readonly StockView[] },
  StoreUnavailable,
  Inventory.Store.InventoryStore
> = Effect.map(
  Effect.flatMap(
    Inventory.Store.InventoryStore,
    (store) => Effect.forEach(pageSizes, (limit) => walkStock(store, { limit, warehouseId: ANY_WAREHOUSE })),
  ),
  (walks) => ({ walks }),
)

const oneWarehouseWalked: Effect.Effect<
  {
    readonly central: readonly StockView[]
    readonly north: readonly StockView[]
  },
  StoreUnavailable,
  Inventory.Store.InventoryStore
> = Effect.flatMap(Inventory.Store.InventoryStore, (store) =>
  Effect.gen(function*() {
    const central = yield* Effect.forEach(pageSizes, (limit) => walkStock(store, { limit, warehouseId: onlyCentral }))
    const north = yield* Effect.forEach(pageSizes, (limit) => walkStock(store, { limit, warehouseId: onlyNorth }))
    return { central, north }
  }))

const EVERY_LOT_IN_ORDER = [
  'lot-kettle-a',
  'lot-kettle-b',
  'lot-mug-a',
  'lot-teapot-a',
  'lot-teapot-north',
]

Feature('The stock catalogue reads the same in memory and in Postgres')
  .withScenarioLayer(inventoryStoreWorld)
  .body(({ scenario }) => {
    scenario(
      'Reading the same page of stock twice shows the same lots',
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('readings', () => acrossInventoryStores(firstPageReadTwice)),
        Then('both readings show the same first page')((s) => {
          expect(s.readings.memory.first).toEqual(s.readings.memory.second)
          expect(s.readings.postgres.first).toEqual(s.readings.memory.first)
          expect(s.readings.memory.first.lots.map((lot) => lot.lotId)).toEqual(['lot-kettle-a', 'lot-kettle-b'])
          expect(s.readings.memory.first.nextCursor).toBeTypeOf('string')
        }),
      ),
    )

    scenario(
      'Two warehouses can be listed in either order',
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('listings', () => acrossInventoryStores(bothWarehousesListed)),
        Then('the two listings come back the same whichever warehouse was listed first')((s) => {
          expect(s.listings.memory.centralThenNorth[0]).toEqual(s.listings.memory.northThenCentral[1])
          expect(s.listings.memory.centralThenNorth[1]).toEqual(s.listings.memory.northThenCentral[0])
          expect(s.listings.postgres.centralThenNorth[0]).toEqual(s.listings.postgres.northThenCentral[1])
          expect(s.listings.postgres.centralThenNorth[1]).toEqual(s.listings.postgres.northThenCentral[0])
          expect(s.listings.postgres.centralThenNorth).toEqual(s.listings.memory.centralThenNorth)
        }),
      ),
    )

    scenario(
      'Paging the whole catalogue in small steps reaches every lot once, in a stable order',
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('walks', () => acrossInventoryStores(wholeCatalogueWalked)),
        Then('every page size lists the same lots in the same order, each exactly once')((s) => {
          const walks = s.walks.memory.walks
          expect(walks[0]?.lots.map((lot) => lot.lotId)).toEqual(EVERY_LOT_IN_ORDER)
          expect(walks[1]).toEqual(walks[0])
          expect(walks[2]).toEqual(walks[0])
          expect(walks[3]).toEqual(walks[0])
          expect(walks[0]?.nextCursor).toBeNull()
          expect(walks[0]?.lots[0]).toEqual({
            warehouseId: CENTRAL_WAREHOUSE,
            region: 'central',
            lotId: 'lot-kettle-a',
            sku: 'sku-kettle',
            quantityOnHand: 5,
            version: 1,
          })
          expect(s.walks.postgres.walks).toEqual(walks)
        }),
      ),
    )

    scenario(
      "Paging a single warehouse reaches exactly that warehouse's lots",
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('walks', () => acrossInventoryStores(oneWarehouseWalked)),
        Then('every page size lists only the lots of the warehouse asked about')((s) => {
          expect(s.walks.memory.central.map((walk) => walk.lots.map((lot) => lot.lotId))).toEqual([
            ['lot-kettle-a', 'lot-kettle-b', 'lot-teapot-a'],
            ['lot-kettle-a', 'lot-kettle-b', 'lot-teapot-a'],
            ['lot-kettle-a', 'lot-kettle-b', 'lot-teapot-a'],
            ['lot-kettle-a', 'lot-kettle-b', 'lot-teapot-a'],
          ])
          expect(s.walks.memory.north.map((walk) => walk.lots.map((lot) => lot.lotId))).toEqual([
            ['lot-mug-a', 'lot-teapot-north'],
            ['lot-mug-a', 'lot-teapot-north'],
            ['lot-mug-a', 'lot-teapot-north'],
            ['lot-mug-a', 'lot-teapot-north'],
          ])
          expect(s.walks.postgres.central).toEqual(s.walks.memory.central)
          expect(s.walks.postgres.north).toEqual(s.walks.memory.north)
          expect(s.walks.memory.north.map((walk) => walk.nextCursor)).toEqual([null, null, null, null])
        }),
      ),
    )
  })
