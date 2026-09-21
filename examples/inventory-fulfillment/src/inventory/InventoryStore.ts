import { Context, type Effect, Layer, type Option } from 'effect'
import { make as makeDrizzle } from '../store/InventoryStoreDrizzle.js'
import type { SkuId, WarehouseStockPartition } from './inventory.schema.js'

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
) {
  static readonly Live = Layer.effect(this, makeDrizzle)
}
