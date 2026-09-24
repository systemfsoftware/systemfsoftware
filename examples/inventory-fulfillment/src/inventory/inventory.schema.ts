/// <reference types="vitest/importMeta" />
import { Encoding, Schema as S } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

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

export const Quantity = S.Int.pipe(S.check(S.isGreaterThan(0)))
export type Quantity = S.Schema.Type<typeof Quantity>

export const QuantityOnHand = S.Int.pipe(S.check(S.isGreaterThanOrEqualTo(0)))
export type QuantityOnHand = S.Schema.Type<typeof QuantityOnHand>

export const StockPosition = S.Struct({ sku: S.NonEmptyString, lotId: S.NonEmptyString })
export type StockPosition = S.Schema.Type<typeof StockPosition>

/** The store's paging position: a base64 JSON `{"sku","lotId"}` continuation token. */
export const StockCursor = S.StringFromBase64.pipe(
  S.decodeTo(S.fromJsonString(StockPosition)),
  S.annotate({ identifier: 'StockCursor' }),
)

export const StockPageSize = S.Int.pipe(
  S.check(S.isGreaterThan(0)),
  S.check(S.isLessThanOrEqualTo(100)),
)

export class StockLot extends S.Class<StockLot>('StockLot')({
  lotId: LotId,
  sku: SkuId,
  warehouseId: WarehouseId,
  quantityOnHand: QuantityOnHand,
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
}) {}

const identifierSeeds = ['', 'a']
const positiveIntegerSeeds = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1]
const nonNegativeIntegerSeeds = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]

const nonEmpty = (value: string): boolean => value.length > 0
const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0
const nonNegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0

const skuIdVerdicts = (candidates: readonly string[]): boolean =>
  Arr.every(candidates, (candidate) => Result.isSuccess(S.decodeResult(SkuId)(candidate)) === nonEmpty(candidate))

const warehouseIdVerdicts = (candidates: readonly string[]): boolean =>
  Arr.every(
    candidates,
    (candidate) => Result.isSuccess(S.decodeResult(WarehouseId)(candidate)) === nonEmpty(candidate),
  )

const lotIdVerdicts = (candidates: readonly string[]): boolean =>
  Arr.every(candidates, (candidate) => Result.isSuccess(S.decodeResult(LotId)(candidate)) === nonEmpty(candidate))

const versionVerdicts = (candidates: readonly number[]): boolean =>
  Arr.every(
    candidates,
    (candidate) => Result.isSuccess(S.decodeResult(Version)(candidate)) === positiveInteger(candidate),
  )

const quantityVerdicts = (candidates: readonly number[]): boolean =>
  Arr.every(
    candidates,
    (candidate) => Result.isSuccess(S.decodeResult(Quantity)(candidate)) === positiveInteger(candidate),
  )

const quantityOnHandVerdicts = (candidates: readonly number[]): boolean =>
  Arr.every(
    candidates,
    (candidate) => Result.isSuccess(S.decodeResult(QuantityOnHand)(candidate)) === nonNegativeInteger(candidate),
  )

const cursorSeeds = [
  '',
  '!!!',
  'not base64 at all',
  Encoding.encodeBase64('plain text'),
  Encoding.encodeBase64('{"sku":""}'),
  Encoding.encodeBase64('{"sku":"a","lotId":""}'),
  Encoding.encodeBase64('{"sku":"","lotId":"b"}'),
  Encoding.encodeBase64('{"sku":1,"lotId":"b"}'),
  Encoding.encodeBase64('"just a string"'),
  Encoding.encodeBase64('["a","b"]'),
  Encoding.encodeBase64('{"sku":"sku-a","lotId":"lot-1"}'),
]

const jsonPosition = S.fromJsonString(StockPosition)

const stockCursorShape = (token: string): boolean =>
  Result.match(Encoding.decodeBase64String(token), {
    onFailure: () => false,
    onSuccess: (plain) => Result.isSuccess(S.decodeResult(jsonPosition)(plain)),
  })

const stockCursorVerdicts = (candidates: readonly string[]): boolean =>
  Arr.every(
    candidates,
    (candidate) => Result.isSuccess(S.decodeResult(StockCursor)(candidate)) === stockCursorShape(candidate),
  )

const pageSizeSeeds = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 101, 1, 100]

const pageSizeShape = (value: number): boolean => positiveInteger(value) && value <= 100

const pageSizeVerdicts = (candidates: readonly number[]): boolean =>
  Arr.every(
    candidates,
    (candidate) => Result.isSuccess(S.decodeResult(StockPageSize)(candidate)) === pageSizeShape(candidate),
  )

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static
  // import would enter the published module graph (packages/effect-memfs/src/driver-values.ts).
  const { it } = await import('@effect/vitest')

  it.prop('∀s_SkuIdRefusal_≡NonEmpty', [S.String], ([value]) => skuIdVerdicts(Arr.append(identifierSeeds, value)))

  it.prop(
    '∀s_WarehouseIdRefusal_≡NonEmpty',
    [S.String],
    ([value]) => warehouseIdVerdicts(Arr.append(identifierSeeds, value)),
  )

  it.prop('∀s_LotIdRefusal_≡NonEmpty', [S.String], ([value]) => lotIdVerdicts(Arr.append(identifierSeeds, value)))

  it.prop(
    '∀n_VersionRefusal_≡Positive',
    [S.Finite],
    ([value]) => versionVerdicts(Arr.append(positiveIntegerSeeds, value)),
  )

  it.prop(
    '∀n_QuantityRefusal_≡Positive',
    [S.Finite],
    ([value]) => quantityVerdicts(Arr.append(positiveIntegerSeeds, value)),
  )

  it.prop(
    '∀n_QuantityOnHandRefusal_≡NonNegative',
    [S.Finite],
    ([value]) => quantityOnHandVerdicts(Arr.append(nonNegativeIntegerSeeds, value)),
  )

  it.prop(
    '∀s_StockCursorRefusal_≡Base64JsonPosition',
    [S.String],
    ([value]) => stockCursorVerdicts(Arr.append(cursorSeeds, value)),
  )

  it.prop(
    '∀n_StockPageSizeRefusal_≡BoundedPositive',
    [S.Finite],
    ([value]) => pageSizeVerdicts(Arr.append(pageSizeSeeds, value)),
  )
}
