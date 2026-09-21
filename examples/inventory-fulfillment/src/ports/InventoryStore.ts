import { Context, Effect, type Option } from 'effect'
import type { SkuId, WarehouseStockPartition } from '../domain/inventory.schema.js'

export interface StockPageQuery {
  readonly cursor: Option.Option<string>
  readonly limit: number
  readonly warehouseId: Option.Option<string>
}

export interface StockPage {
  readonly partitions: readonly WarehouseStockPartition[]
  readonly nextCursor: Option.Option<string>
}

export interface InventoryStoreService {
  readonly readAllStock: Effect.Effect<readonly WarehouseStockPartition[]>
  readonly readStock: (skus: readonly SkuId[]) => Effect.Effect<readonly WarehouseStockPartition[]>
  readonly readStockPage: (query: StockPageQuery) => Effect.Effect<StockPage>
}

export class InventoryStore extends Context.Service<InventoryStore, InventoryStoreService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/InventoryStore',
) {}
