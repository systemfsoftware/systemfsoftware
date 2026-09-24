import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core'
import { inArray } from 'drizzle-orm/sql/expressions/conditions'
import { Array as Arr, Effect, HashMap, Option, Record as Record_ } from 'effect'
import { dual } from 'effect/Function'
import type { SchemaError } from 'effect/Schema'
import type { WarehouseStockPartition } from '../inventory/inventory.schema.js'
import { decodeWarehouseStockPartition } from './decode.js'
import type { DrizzleDatabase } from './DrizzleSession.js'
import { stockLots, warehouses } from './schema.tables.js'

export type StockLotRow = typeof stockLots.$inferSelect
type WarehouseRow = typeof warehouses.$inferSelect

interface LotRow {
  readonly lotId: string
  readonly sku: string
  readonly warehouseId: string
  readonly quantityOnHand: number
  readonly version: number
  readonly expiresAt: Date | null
}

interface PartitionRow {
  readonly warehouseId: string
  readonly region: string
  readonly lots: readonly LotRow[]
}

const lotRowOf = (lot: StockLotRow): LotRow => ({
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
): readonly PartitionRow[] =>
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
  rows: readonly PartitionRow[],
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

export const partitionsFor: {
  (lots: readonly StockLotRow[]): (db: DrizzleDatabase) => Effect.Effect<
    readonly WarehouseStockPartition[],
    EffectDrizzleQueryError | SchemaError
  >
  (db: DrizzleDatabase, lots: readonly StockLotRow[]): Effect.Effect<
    readonly WarehouseStockPartition[],
    EffectDrizzleQueryError | SchemaError
  >
} = dual(2, (db: DrizzleDatabase, lots: readonly StockLotRow[]) =>
  Effect.gen(function*() {
    const regions = yield* regionIndex(db, Arr.map(lots, (lot) => lot.warehouseId))
    return yield* decodePartitions(buildPartitions(lots, regions))
  }))
