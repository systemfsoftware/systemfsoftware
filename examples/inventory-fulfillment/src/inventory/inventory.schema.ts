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

export const StockLot = S.Struct({
  lotId: LotId,
  sku: SkuId,
  warehouseId: WarehouseId,
  quantityOnHand: QuantityOnHand,
  version: Version,
  expiresAt: S.Option(S.DateTimeUtc),
})
export type StockLot = S.Schema.Type<typeof StockLot>

export const WarehouseStockPartition = S.Struct({
  warehouseId: WarehouseId,
  region: S.String,
  lots: S.Array(StockLot),
})
export type WarehouseStockPartition = S.Schema.Type<typeof WarehouseStockPartition>

export const KitComponent = S.Struct({
  sku: SkuId,
  quantity: Quantity,
})
export type KitComponent = S.Schema.Type<typeof KitComponent>

export const KitDefinition = S.Struct({
  kitSku: SkuId,
  components: S.Array(KitComponent),
})
export type KitDefinition = S.Schema.Type<typeof KitDefinition>

export const LotAllocation = S.Struct({
  warehouseId: WarehouseId,
  lotId: LotId,
  sku: SkuId,
  quantity: Quantity,
})
export type LotAllocation = S.Schema.Type<typeof LotAllocation>

const identifierSeeds = ['', 'a']
const positiveIntegerSeeds = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1]
const nonNegativeIntegerSeeds = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]

const nonEmpty = (value: string): boolean => value.length > 0
const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0
const nonNegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0

const verdictsAgainst = <Value>(
  decodes: (value: Value) => boolean,
  shape: (value: Value) => boolean,
  candidates: readonly Value[],
): boolean => Arr.every(candidates, (candidate) => decodes(candidate) === shape(candidate))

const skuIdDecodes = (value: string): boolean => Result.isSuccess(S.decodeResult(SkuId)(value))
const warehouseIdDecodes = (value: string): boolean => Result.isSuccess(S.decodeResult(WarehouseId)(value))
const lotIdDecodes = (value: string): boolean => Result.isSuccess(S.decodeResult(LotId)(value))
const versionDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(Version)(value))
const quantityDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(Quantity)(value))
const quantityOnHandDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(QuantityOnHand)(value))

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

const stockCursorDecodes = (token: string): boolean => Result.isSuccess(S.decodeResult(StockCursor)(token))

const pageSizeSeeds = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 101, 1, 100]

const pageSizeShape = (value: number): boolean => positiveInteger(value) && value <= 100

const stockPageSizeDecodes = (value: number): boolean => Result.isSuccess(S.decodeResult(StockPageSize)(value))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static
  // import would enter the published module graph (packages/effect-memfs/src/driver-values.ts).
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_SkuIdRefusal_≡NonEmpty',
    { of: [S.String], subject: skuIdDecodes },
    (subject, [value]) => verdictsAgainst(subject, nonEmpty, Arr.append(identifierSeeds, value)),
  )

  it.prop(
    '∀s_WarehouseIdRefusal_≡NonEmpty',
    { of: [S.String], subject: warehouseIdDecodes },
    (subject, [value]) => verdictsAgainst(subject, nonEmpty, Arr.append(identifierSeeds, value)),
  )

  it.prop(
    '∀s_LotIdRefusal_≡NonEmpty',
    { of: [S.String], subject: lotIdDecodes },
    (subject, [value]) => verdictsAgainst(subject, nonEmpty, Arr.append(identifierSeeds, value)),
  )

  it.prop(
    '∀n_VersionRefusal_≡Positive',
    { of: [S.Finite], subject: versionDecodes },
    (subject, [value]) => verdictsAgainst(subject, positiveInteger, Arr.append(positiveIntegerSeeds, value)),
  )

  it.prop(
    '∀n_QuantityRefusal_≡Positive',
    { of: [S.Finite], subject: quantityDecodes },
    (subject, [value]) => verdictsAgainst(subject, positiveInteger, Arr.append(positiveIntegerSeeds, value)),
  )

  it.prop(
    '∀n_QuantityOnHandRefusal_≡NonNegative',
    { of: [S.Finite], subject: quantityOnHandDecodes },
    (subject, [value]) => verdictsAgainst(subject, nonNegativeInteger, Arr.append(nonNegativeIntegerSeeds, value)),
  )

  it.prop(
    '∀s_StockCursorRefusal_≡Base64JsonPosition',
    { of: [S.String], subject: stockCursorDecodes },
    (subject, [value]) => verdictsAgainst(subject, stockCursorShape, Arr.append(cursorSeeds, value)),
  )

  it.prop(
    '∀n_StockPageSizeRefusal_≡BoundedPositive',
    { of: [S.Finite], subject: stockPageSizeDecodes },
    (subject, [value]) => verdictsAgainst(subject, pageSizeShape, Arr.append(pageSizeSeeds, value)),
  )
}
