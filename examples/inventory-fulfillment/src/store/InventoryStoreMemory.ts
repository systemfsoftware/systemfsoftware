import { Array as Arr, Effect, HashMap, Layer, Option, Order, Record as Record_, Ref, Schema as S } from 'effect'
import { StoreUnavailable } from '../fulfillment/decision.schema.js'
import { StockCursor, type StockPosition } from '../inventory/inventory.schema.js'
import { InventoryStore, type StockPage, type StockPageQuery } from '../inventory/InventoryStore.service.js'
import { decodeWarehouseStockPartition } from './decode.js'

/** The same warehouse and lot history the Postgres store is seeded with. */
export interface InventoryStoreSeed {
  readonly warehouses: readonly { readonly warehouseId: string; readonly region: string }[]
  readonly lots: readonly {
    readonly lotId: string
    readonly sku: string
    readonly warehouseId: string
    readonly quantityOnHand: number
    readonly version: number
  }[]
}

interface LotState {
  readonly lotId: string
  readonly sku: string
  readonly warehouseId: string
  readonly quantityOnHand: number
  readonly version: number
}

interface MemoryState {
  readonly warehouses: HashMap.HashMap<string, string>
  readonly lots: HashMap.HashMap<string, LotState>
}

const byPosition: Order.Order<StockPosition> = Order.combine(
  Order.mapInput(Order.String, (position: StockPosition) => position.sku),
  Order.mapInput(Order.String, (position: StockPosition) => position.lotId),
)

const byLotPosition: Order.Order<LotState> = Order.mapInput(byPosition, (lot: LotState) => lot)

const positionOf = (lot: LotState): StockPosition => ({ sku: lot.sku, lotId: lot.lotId })

const initialStateOf = (seed: InventoryStoreSeed): MemoryState => ({
  warehouses: HashMap.fromIterable(
    Arr.map(seed.warehouses, (warehouse) => [warehouse.warehouseId, warehouse.region] as const),
  ),
  lots: HashMap.fromIterable(Arr.map(seed.lots, (lot) => [
    lot.lotId,
    {
      lotId: lot.lotId,
      sku: lot.sku,
      warehouseId: lot.warehouseId,
      quantityOnHand: lot.quantityOnHand,
      version: lot.version,
    } satisfies LotState,
  ])),
})

const cursorBoundaryPassed = (after: StockPosition | undefined, lot: LotState): boolean =>
  after === undefined || Order.isLessThan(byPosition)(after, positionOf(lot))

const inWarehouse = (query: StockPageQuery, lot: LotState): boolean =>
  Option.match(query.warehouseId, {
    onNone: () => true,
    onSome: (warehouseId) => lot.warehouseId === warehouseId,
  })

const visible = (query: StockPageQuery, after: StockPosition | undefined) => (lot: LotState): boolean =>
  inWarehouse(query, lot) && cursorBoundaryPassed(after, lot)

const continuationTokenOf = (
  rows: readonly LotState[],
  page: readonly LotState[],
): Effect.Effect<Option.Option<string>, S.SchemaError> =>
  rows.length <= page.length
    ? Effect.succeedNone
    : Option.match(Arr.last(page), {
      onNone: () => Effect.succeedNone,
      onSome: (lot) => Effect.asSome(S.encodeEffect(StockCursor)(positionOf(lot))),
    })

const partitionsFor = (state: MemoryState, page: readonly LotState[]) =>
  Effect.gen(function*() {
    const groups = Record_.toEntries(Arr.groupBy(page, (lot) => lot.warehouseId))
    const partitions = yield* Effect.forEach(groups, ([warehouseId, group]) =>
      Option.match(HashMap.get(state.warehouses, warehouseId), {
        onNone: () =>
          Effect.succeedNone,
        onSome: (region) =>
          Effect.asSome(
            decodeWarehouseStockPartition({
              warehouseId,
              region,
              lots: Arr.map(group, (lot) => ({
                lotId: lot.lotId,
                sku: lot.sku,
                warehouseId,
                quantityOnHand: lot.quantityOnHand,
                version: lot.version,
                expiresAt: null,
              })),
            }),
          ),
      }))
    return Arr.getSomes(partitions)
  })

const readStockPage = (state: Ref.Ref<MemoryState>, query: StockPageQuery) =>
  Effect.gen(function*() {
    const current = yield* Ref.get(state)
    const after = Option.getOrUndefined(query.cursor)
    const rows = Arr.sort(
      Arr.filter(Arr.fromIterable(HashMap.values(current.lots)), visible(query, after)),
      byLotPosition,
    )
    const page = Arr.take(rows, query.limit)
    const stockPage: StockPage = {
      partitions: yield* partitionsFor(current, page),
      nextCursor: yield* continuationTokenOf(rows, page),
    }
    return stockPage
  }).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

export const layer = (seed: InventoryStoreSeed): Layer.Layer<InventoryStore> =>
  Layer.effect(
    InventoryStore,
    Effect.gen(function*() {
      const state = yield* Ref.make(initialStateOf(seed))
      return {
        readStockPage: (query: StockPageQuery) => readStockPage(state, query),
      }
    }),
  )
