import type { SQL } from 'drizzle-orm'
import { and, eq, gt, inArray, or } from 'drizzle-orm/sql/expressions/conditions'
import { asc } from 'drizzle-orm/sql/expressions/select'
import { Array as Arr, Effect, Encoding, HashMap, Option, Record as Record_, Result } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { SkuId, WarehouseStockPartition } from '../inventory/inventory.schema.js'
import type { StockPageQuery } from '../inventory/InventoryStore.js'
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

type AnyPartitionRow<R = unknown> = R

const buildPartitions = (
  lots: readonly StockLotRow[],
  regions: HashMap.HashMap<string, string>,
): readonly AnyPartitionRow[] =>
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
  rows: readonly AnyPartitionRow[],
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

const cursorOfLot = (lot: StockLotRow): string => Encoding.encodeBase64(`${lot.sku}:${lot.id}`)

const isBoundary = (decoded: string, boundary: number): boolean => boundary > 0 && boundary !== decoded.length - 1

const splitBoundary = (decoded: string): Option.Option<readonly [string, string]> => {
  const boundary = decoded.lastIndexOf(':')
  if (!isBoundary(decoded, boundary)) return Option.none()
  return Option.some([decoded.slice(0, boundary), decoded.slice(boundary + 1)] as const)
}

const boundaryOf = (cursor: string): Option.Option<readonly [string, string]> =>
  Result.match(Encoding.decodeBase64String(cursor), {
    onFailure: () => Option.none(),
    onSuccess: splitBoundary,
  })

const afterBoundary = (boundary: readonly [string, string]): SQL | undefined =>
  or(gt(stockLots.sku, boundary[0]), and(eq(stockLots.sku, boundary[0]), gt(stockLots.id, boundary[1])))

const cursorFilter = (cursor: Option.Option<string>): Option.Option<SQL | undefined> =>
  Option.match(cursor, {
    onNone: () => Option.some(undefined),
    onSome: (token) => Option.map(boundaryOf(token), afterBoundary),
  })

const warehouseFilter = (query: StockPageQuery): SQL | undefined =>
  Option.getOrUndefined(Option.map(query.warehouseId, (warehouseId) => eq(stockLots.warehouseId, warehouseId)))

const pageRows = (rows: readonly StockLotRow[], limit: number): readonly StockLotRow[] => {
  if (rows.length > limit) return rows.slice(0, limit)
  return rows
}

const continuationOf = (rows: readonly StockLotRow[], page: readonly StockLotRow[]): Option.Option<string> => {
  if (rows.length <= page.length) return Option.none()
  return Option.map(Arr.last(page), cursorOfLot)
}

const readStockPage = (db: DrizzleDatabase, query: StockPageQuery) =>
  Effect.gen(function*() {
    const after = yield* Option.match(cursorFilter(query.cursor), {
      onNone: (): Effect.Effect<SQL | undefined> =>
        Effect.die(new Error('listStock: cursor is not a valid continuation token')),
      onSome: (condition) => Effect.succeed(condition),
    })
    const rows: readonly StockLotRow[] = yield* db
      .select()
      .from(stockLots)
      .where(and(warehouseFilter(query), after))
      .orderBy(asc(stockLots.sku), asc(stockLots.id))
      .limit(query.limit + 1)
    const page = pageRows(rows, query.limit)
    return { partitions: yield* partitionsFor(db, page), nextCursor: continuationOf(rows, page) }
  })

export const make = Effect.gen(function*() {
  const db = yield* DrizzleSession
  return {
    readAllStock: readAllStock(db).pipe(Effect.orDie),
    readStock: (skus: readonly SkuId[]) => readStock(db, skus).pipe(Effect.orDie),
    readStockPage: (query: StockPageQuery) => readStockPage(db, query).pipe(Effect.orDie),
  }
})
