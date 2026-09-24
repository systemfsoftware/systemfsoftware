import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Inventory } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Option, Result, Schema as S } from 'effect'
import {
  acrossInventoryStores,
  CENTRAL_WAREHOUSE,
  inventoryStoreWorld,
  NORTH_WAREHOUSE,
  type StockLotView,
  type StockView,
  stockViewOf,
  walkStock,
} from './__fixtures__/inventory-store.fixture.js'

const Feature = makeFeature({ it })

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

const KETTLE_A: StockLotView = {
  warehouseId: CENTRAL_WAREHOUSE,
  region: 'central',
  lotId: 'lot-kettle-a',
  sku: 'sku-kettle',
  quantityOnHand: 5,
  version: 1,
}
const KETTLE_B: StockLotView = {
  warehouseId: CENTRAL_WAREHOUSE,
  region: 'central',
  lotId: 'lot-kettle-b',
  sku: 'sku-kettle',
  quantityOnHand: 6,
  version: 2,
}
const TEAPOT_A: StockLotView = {
  warehouseId: CENTRAL_WAREHOUSE,
  region: 'central',
  lotId: 'lot-teapot-a',
  sku: 'sku-teapot',
  quantityOnHand: 7,
  version: 3,
}
const MUG_A: StockLotView = {
  warehouseId: NORTH_WAREHOUSE,
  region: 'north',
  lotId: 'lot-mug-a',
  sku: 'sku-mug',
  quantityOnHand: 8,
  version: 4,
}
const TEAPOT_NORTH: StockLotView = {
  warehouseId: NORTH_WAREHOUSE,
  region: 'north',
  lotId: 'lot-teapot-north',
  sku: 'sku-teapot',
  quantityOnHand: 9,
  version: 5,
}

const CENTRAL_LISTING: StockView = { lots: [KETTLE_A, KETTLE_B, TEAPOT_A], nextCursor: null }
const NORTH_LISTING: StockView = { lots: [MUG_A, TEAPOT_NORTH], nextCursor: null }
const CATALOGUE_LISTING: StockView = { lots: [KETTLE_A, KETTLE_B, MUG_A, TEAPOT_A, TEAPOT_NORTH], nextCursor: null }
const FIRST_PAGE: StockView = {
  lots: [KETTLE_A, KETTLE_B],
  nextCursor: Result.getOrThrow(
    S.encodeResult(Inventory.Schema.StockCursor)({ sku: 'sku-kettle', lotId: 'lot-kettle-b' }),
  ),
}

Feature('The stock catalogue reads the same in memory and in Postgres', { timeout: 120_000 })
  .withScenarioLayer(inventoryStoreWorld)
  .live('the Postgres side runs through in-process PGlite, whose file reads the simulation kernel cannot observe')
  .body(({ scenario }) => {
    scenario(
      'Reading the same page of stock twice shows the same lots',
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('readings', () => acrossInventoryStores(firstPageReadTwice)),
        Then('both readings show the same first page')((s, expect) =>
          expect(s.readings).toEqual({
            memory: { first: FIRST_PAGE, second: FIRST_PAGE },
            postgres: { first: FIRST_PAGE, second: FIRST_PAGE },
          })
        ),
      ),
    )

    scenario(
      'Two warehouses can be listed in either order',
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('listings', () => acrossInventoryStores(bothWarehousesListed)),
        Then('the two listings come back the same whichever warehouse was listed first')((s, expect) =>
          expect(s.listings).toEqual({
            memory: {
              centralThenNorth: [CENTRAL_LISTING, NORTH_LISTING],
              northThenCentral: [NORTH_LISTING, CENTRAL_LISTING],
            },
            postgres: {
              centralThenNorth: [CENTRAL_LISTING, NORTH_LISTING],
              northThenCentral: [NORTH_LISTING, CENTRAL_LISTING],
            },
          })
        ),
      ),
    )

    scenario(
      'Paging the whole catalogue in small steps reaches every lot once, in a stable order',
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('walks', () => acrossInventoryStores(wholeCatalogueWalked)),
        Then('every page size lists the same lots in the same order, each exactly once')((s, expect) =>
          expect(s.walks).toEqual({
            memory: {
              walks: [CATALOGUE_LISTING, CATALOGUE_LISTING, CATALOGUE_LISTING, CATALOGUE_LISTING],
            },
            postgres: {
              walks: [CATALOGUE_LISTING, CATALOGUE_LISTING, CATALOGUE_LISTING, CATALOGUE_LISTING],
            },
          })
        ),
      ),
    )

    scenario(
      "Paging a single warehouse reaches exactly that warehouse's lots",
      Gherkin.Do.pipe(
        Given('two warehouses stocked with five lots')('walks', () => acrossInventoryStores(oneWarehouseWalked)),
        Then('every page size lists only the lots of the warehouse asked about')((s, expect) =>
          expect(s.walks).toEqual({
            memory: {
              central: [CENTRAL_LISTING, CENTRAL_LISTING, CENTRAL_LISTING, CENTRAL_LISTING],
              north: [NORTH_LISTING, NORTH_LISTING, NORTH_LISTING, NORTH_LISTING],
            },
            postgres: {
              central: [CENTRAL_LISTING, CENTRAL_LISTING, CENTRAL_LISTING, CENTRAL_LISTING],
              north: [NORTH_LISTING, NORTH_LISTING, NORTH_LISTING, NORTH_LISTING],
            },
          })
        ),
      ),
    )
  })
