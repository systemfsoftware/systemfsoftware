import type { SQL } from 'drizzle-orm'
import { and, eq, gt, or } from 'drizzle-orm/sql/expressions/conditions'
import { asc } from 'drizzle-orm/sql/expressions/select'
import { Array as Arr, Effect, Layer, Option, Schema as S } from 'effect'
import { StoreUnavailable } from '../fulfillment/decision.schema.js'
import { StockCursor, type StockPosition } from '../inventory/inventory.schema.js'
import { InventoryStore, type StockPageQuery } from '../inventory/InventoryStore.service.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { stockLots } from './schema.tables.js'
import { partitionsFor, type StockLotRow } from './stockPartitions.js'

const afterBoundary = (position: StockPosition): SQL | undefined =>
  or(gt(stockLots.sku, position.sku), and(eq(stockLots.sku, position.sku), gt(stockLots.id, position.lotId)))

const warehouseFilter = (query: StockPageQuery): SQL | undefined =>
  Option.getOrUndefined(Option.map(query.warehouseId, (warehouseId) => eq(stockLots.warehouseId, warehouseId)))

const pageRows = (rows: readonly StockLotRow[], limit: number): readonly StockLotRow[] => {
  if (rows.length > limit) return rows.slice(0, limit)
  return rows
}

const continuationOf = (
  rows: readonly StockLotRow[],
  page: readonly StockLotRow[],
): Effect.Effect<Option.Option<string>, S.SchemaError> =>
  rows.length <= page.length
    ? Effect.succeedNone
    : Option.match(Arr.last(page), {
      onNone: () => Effect.succeedNone,
      onSome: (lot) => Effect.asSome(S.encodeEffect(StockCursor)({ sku: lot.sku, lotId: lot.id })),
    })

const readStockPage = (db: DrizzleDatabase, query: StockPageQuery) =>
  Effect.gen(function*() {
    const after = Option.getOrUndefined(Option.map(query.cursor, afterBoundary))
    const rows: readonly StockLotRow[] = yield* db
      .select()
      .from(stockLots)
      .where(and(warehouseFilter(query), after))
      .orderBy(asc(stockLots.sku), asc(stockLots.id))
      .limit(query.limit + 1)
    const page = pageRows(rows, query.limit)
    return { partitions: yield* partitionsFor(db, page), nextCursor: yield* continuationOf(rows, page) }
  }).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

export const layer: Layer.Layer<InventoryStore, never, DrizzleSession> = Layer.effect(
  InventoryStore,
  Effect.gen(function*() {
    const db = yield* DrizzleSession
    return {
      readStockPage: (query: StockPageQuery) => readStockPage(db, query),
    }
  }),
)
