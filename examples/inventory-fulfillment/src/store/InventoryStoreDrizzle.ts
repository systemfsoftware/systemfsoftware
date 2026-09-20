import { inArray } from 'drizzle-orm/sql/expressions/conditions'
import { Array as Arr, Effect, HashMap, Layer, Option, Record as Record_ } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { SkuId, WarehouseStockPartition } from '../domain/inventory.schema.js'
import { InventoryStore } from '../ports/InventoryStore.js'
import { decodeWarehouseStockPartition } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { stockLots, warehouses } from './schema.tables.js'

type StockLotRow = typeof stockLots.$inferSelect
type WarehouseRow = typeof warehouses.$inferSelect

const lotRowOf = (lot: StockLotRow) => ({
  lotId: lot.id,
  sku: lot.sku,
  warehouseId: lot.warehouseId,
  quantityOnHand: lot.quantityOnHand,
  version: lot.version,
  expiresAt: lot.expiresAt,
})

const buildPartitions = (
  lots: readonly StockLotRow[],
  regions: HashMap.HashMap<string, string>,
): readonly unknown[] =>
  Arr.getSomes(
    Arr.map(
      Record_.toEntries(Arr.groupBy(lots, (lot) => lot.warehouseId)),
      ([warehouseId, group]) =>
        Option.map(HashMap.get(regions, warehouseId), (region) => ({
          warehouseId,
          region,
          lots: Arr.map(group, lotRowOf),
        })),
    ),
  )

const decodePartitions = (
  rows: readonly unknown[],
): Effect.Effect<readonly WarehouseStockPartition[], SchemaError> =>
  Effect.forEach(rows, (row) => decodeWarehouseStockPartition(row))

const regionIndex = (db: DrizzleDatabase, warehouseIds: readonly string[]) =>
  Effect.gen(function*() {
    const rows: readonly WarehouseRow[] = yield* db
      .select()
      .from(warehouses)
      .where(inArray(warehouses.id, warehouseIds))
    return HashMap.fromIterable(Arr.map(rows, (warehouse) => [warehouse.id, warehouse.region] as const))
  })

const partitionsFor = (db: DrizzleDatabase, lots: readonly StockLotRow[]) =>
  Effect.gen(function*() {
    const regions = yield* regionIndex(db, Arr.map(lots, (lot) => lot.warehouseId))
    return yield* decodePartitions(buildPartitions(lots, regions))
  })

const readStock = (db: DrizzleDatabase, skus: readonly SkuId[]) =>
  Effect.gen(function*() {
    const lots: readonly StockLotRow[] = yield* db.select().from(stockLots).where(inArray(stockLots.sku, skus))
    return yield* partitionsFor(db, lots)
  })

const readAllStock = (db: DrizzleDatabase) =>
  Effect.gen(function*() {
    const lots: readonly StockLotRow[] = yield* db.select().from(stockLots)
    return yield* partitionsFor(db, lots)
  })

export const layer: Layer.Layer<InventoryStore, never, DrizzleSession> = Layer.effect(
  InventoryStore,
  Effect.gen(function*() {
    const db = yield* DrizzleSession
    return {
      readAllStock: readAllStock(db).pipe(Effect.orDie),
      readStock: (skus: readonly SkuId[]) => readStock(db, skus).pipe(Effect.orDie),
    }
  }),
)
