import { Schema as S } from 'effect'

export const SkuId = S.NonEmptyString.pipe(
  S.annotate({ identifier: 'SkuId' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/SkuId'),
)
export type SkuId = S.Schema.Type<typeof SkuId>

export const WarehouseId = S.NonEmptyString.pipe(
  S.annotate({ identifier: 'WarehouseId' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/WarehouseId'),
)
export type WarehouseId = S.Schema.Type<typeof WarehouseId>

export const LotId = S.NonEmptyString.pipe(
  S.annotate({ identifier: 'LotId' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/LotId'),
)
export type LotId = S.Schema.Type<typeof LotId>

export const Version = S.Int.pipe(
  S.check(S.isGreaterThan(0)),
  S.annotate({ identifier: 'Version' }),
  S.brand('@systemfsoftware/example-inventory-fulfillment/Version'),
)
export type Version = S.Schema.Type<typeof Version>

const Quantity = S.Int.pipe(S.check(S.isGreaterThan(0)))

export class StockLot extends S.Class<StockLot>('StockLot')({
  lotId: LotId,
  sku: SkuId,
  warehouseId: WarehouseId,
  quantityOnHand: S.Int.pipe(S.check(S.isGreaterThanOrEqualTo(0))),
  version: Version,
  expiresAt: S.Option(S.DateTimeUtc),
}) {}

export class WarehouseStockPartition extends S.Class<WarehouseStockPartition>('WarehouseStockPartition')({
  warehouseId: WarehouseId,
  region: S.String,
  lots: S.Array(StockLot),
}) {}

export class KitComponent extends S.Class<KitComponent>('KitComponent')({
  sku: SkuId,
  quantity: Quantity,
}) {}

export class KitDefinition extends S.Class<KitDefinition>('KitDefinition')({
  kitSku: SkuId,
  components: S.Array(KitComponent),
}) {}

export class LotAllocation extends S.Class<LotAllocation>('LotAllocation')({
  warehouseId: WarehouseId,
  lotId: LotId,
  sku: SkuId,
  quantity: Quantity,
  version: Version,
}) {}
