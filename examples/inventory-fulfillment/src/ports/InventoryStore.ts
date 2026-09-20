import { Context, Effect } from 'effect'
import type { SkuId, WarehouseStockPartition } from '../domain/inventory.schema.js'

export interface InventoryStoreService {
  readonly readAllStock: Effect.Effect<readonly WarehouseStockPartition[]>
  readonly readStock: (skus: readonly SkuId[]) => Effect.Effect<readonly WarehouseStockPartition[]>
}

export class InventoryStore extends Context.Service<InventoryStore, InventoryStoreService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/InventoryStore',
) {}
