import { describe, it } from '@effect/vitest'
import { DateTime } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { ComponentDemand } from '../../fulfillment/explode-bundle.workflow.js'
import { allocateStock, AllocateStockCommand, StockAllocated, StockBackordered } from '../allocate-stock.workflow.js'
import type { InsufficientStock, LotReservation } from '../allocate-stock.workflow.js'
import { StockLot, WarehouseStockPartition } from '../inventory.schema.js'

type AllocateResult = Result.Result<StockAllocated | StockBackordered, InsufficientStock>

const templateAt = (templates: readonly StockLot[], index: number): StockLot =>
  Option.getOrThrow(Arr.get(templates, index % templates.length))

const stockOf = (
  lines: readonly ComponentDemand[],
  templates: readonly StockLot[],
): readonly WarehouseStockPartition[] => {
  const warehouseId = Option.getOrThrow(Arr.head(templates)).warehouseId
  const lots = Arr.map(
    lines,
    (line, index) =>
      new StockLot({
        lotId: templateAt(templates, index).lotId,
        sku: line.sku,
        warehouseId,
        quantityOnHand: Num.max(1, line.quantity - 1),
        version: templateAt(templates, index).version,
        expiresAt: templateAt(templates, index).expiresAt,
      }),
  )
  return Arr.of(new WarehouseStockPartition({ warehouseId, region: 'all', lots }))
}

const commandOf = (
  lines: readonly ComponentDemand[],
  stock: readonly WarehouseStockPartition[],
  now: DateTime.Utc,
): AllocateStockCommand => new AllocateStockCommand({ orderId: 'order-1', lines, stock, now })

const requestedBySku = (lines: readonly ComponentDemand[]): ReadonlyMap<string, number> =>
  Arr.reduce(lines, new Map<string, number>(), (acc, line) => {
    acc.set(line.sku, (acc.get(line.sku) ?? 0) + line.quantity)
    return acc
  })

const allocatedBySku = (reservations: readonly LotReservation[]): ReadonlyMap<string, number> =>
  Arr.reduce(reservations, new Map<string, number>(), (acc, reservation) => {
    acc.set(reservation.sku, (acc.get(reservation.sku) ?? 0) + reservation.quantity)
    return acc
  })

const backorderedBySku = (
  unfulfilled: readonly { readonly sku: string; readonly quantity: number }[],
): ReadonlyMap<string, number> =>
  Arr.reduce(unfulfilled, new Map<string, number>(), (acc, demand) => {
    acc.set(demand.sku, (acc.get(demand.sku) ?? 0) + demand.quantity)
    return acc
  })

const availableBySku = (stock: readonly WarehouseStockPartition[]): ReadonlyMap<string, number> =>
  Arr.reduce(
    Arr.flatMap(stock, (partition) => partition.lots),
    new Map<string, number>(),
    (acc, lot) => {
      acc.set(lot.sku, (acc.get(lot.sku) ?? 0) + lot.quantityOnHand)
      return acc
    },
  )

interface AllocationSummary {
  readonly allocated: ReadonlyMap<string, number>
  readonly backordered: ReadonlyMap<string, number>
}

const summaryOf = (decision: StockAllocated | StockBackordered): AllocationSummary =>
  Match.value(decision).pipe(
    Match.tag('StockAllocated', (allocated) => ({
      allocated: allocatedBySku(allocated.reservations),
      backordered: new Map<string, number>(),
    })),
    Match.tag('StockBackordered', (backordered) => ({
      allocated: allocatedBySku(backordered.reservations),
      backordered: backorderedBySku(backordered.backordered),
    })),
    Match.exhaustive,
  )

const skusOf = (...maps: readonly ReadonlyMap<string, number>[]): readonly string[] =>
  Arr.dedupe(Arr.flatMap(maps, (map) => Arr.fromIterable(map.keys())))

const withinStock = (stock: readonly WarehouseStockPartition[], result: AllocateResult): boolean =>
  Result.match(result, {
    onFailure: () => true,
    onSuccess: (decision) => {
      const { allocated } = summaryOf(decision)
      const available = availableBySku(stock)
      return Arr.every(skusOf(allocated), (sku) => (allocated.get(sku) ?? 0) <= (available.get(sku) ?? 0))
    },
  })

const conserves = (lines: readonly ComponentDemand[], result: AllocateResult): boolean =>
  Result.match(result, {
    onFailure: () => true,
    onSuccess: (decision) => {
      const summary = summaryOf(decision)
      const requested = requestedBySku(lines)
      return Arr.every(skusOf(requested, summary.allocated, summary.backordered), (sku) =>
        (summary.allocated.get(sku) ?? 0) + (summary.backordered.get(sku) ?? 0) === (requested.get(sku) ?? 0))
    },
  })

const EPOCH_MILLIS_MIN = -8_640_000_000_000_000

const beforeEarliest = (earliest: number): DateTime.Utc =>
  Match.value(Number.isFinite(earliest)).pipe(
    Match.when(true, () => DateTime.makeUnsafe(Math.max(earliest - 1, EPOCH_MILLIS_MIN))),
    Match.when(false, () => DateTime.makeUnsafe(0)),
    Match.exhaustive,
  )

const earlierThanEveryExpiry = (stock: readonly WarehouseStockPartition[]): DateTime.Utc =>
  beforeEarliest(
    Arr.reduce(Arr.flatMap(stock, (partition) => partition.lots), Number.POSITIVE_INFINITY, (min, lot) =>
      Option.match(lot.expiresAt, {
        onNone: () =>
          min,
        onSome: (expiresAt) =>
          Num.min(min, expiresAt.epochMilliseconds),
      })),
  )

const expireLotsAt = (
  stock: readonly WarehouseStockPartition[],
  at: DateTime.Utc,
): readonly WarehouseStockPartition[] =>
  Arr.map(
    stock,
    (partition) =>
      new WarehouseStockPartition({
        warehouseId: partition.warehouseId,
        region: partition.region,
        lots: Arr.map(
          partition.lots,
          (lot) =>
            new StockLot({
              lotId: lot.lotId,
              sku: lot.sku,
              warehouseId: lot.warehouseId,
              quantityOnHand: lot.quantityOnHand,
              version: lot.version,
              expiresAt: Option.some(at),
            }),
        ),
      }),
  )

const liveLotsOf = (stock: readonly WarehouseStockPartition[], now: DateTime.Utc): readonly StockLot[] =>
  Arr.filter(
    Arr.flatMap(stock, (partition) => partition.lots),
    (lot) =>
      Option.getOrElse(
        Option.map(lot.expiresAt, (expiresAt) => expiresAt.epochMilliseconds > now.epochMilliseconds),
        () => true,
      ),
  )

const liveAvailableBySku = (
  stock: readonly WarehouseStockPartition[],
  now: DateTime.Utc,
): ReadonlyMap<string, number> =>
  Arr.reduce(liveLotsOf(stock, now), new Map<string, number>(), (acc, lot) => {
    acc.set(lot.sku, (acc.get(lot.sku) ?? 0) + lot.quantityOnHand)
    return acc
  })

const reservationsOf = (decision: StockAllocated | StockBackordered): readonly LotReservation[] =>
  Match.value(decision).pipe(
    Match.tag('StockAllocated', (allocated) => allocated.reservations),
    Match.tag('StockBackordered', (backordered) => backordered.reservations),
    Match.exhaustive,
  )

const refusedWithZeroAvailability = (result: AllocateResult): boolean =>
  Result.match(result, {
    onFailure: (error) => error.available === 0,
    onSuccess: () => false,
  })

const onlyLiveReservations = (
  stock: readonly WarehouseStockPartition[],
  now: DateTime.Utc,
  result: AllocateResult,
): boolean =>
  Result.match(result, {
    onFailure: () => true,
    onSuccess: (decision) => {
      const liveIds = new Set(Arr.map(liveLotsOf(stock, now), (lot) => lot.lotId))
      return Arr.every(reservationsOf(decision), (reservation) => liveIds.has(reservation.lotId))
    },
  })

const withinLiveStock = (
  stock: readonly WarehouseStockPartition[],
  now: DateTime.Utc,
  result: AllocateResult,
): boolean =>
  Result.match(result, {
    onFailure: () => true,
    onSuccess: (decision) => {
      const { allocated } = summaryOf(decision)
      const live = liveAvailableBySku(stock, now)
      return Arr.every(skusOf(allocated), (sku) => (allocated.get(sku) ?? 0) <= (live.get(sku) ?? 0))
    },
  })

const refusalMatchesLiveAvailability = (
  stock: readonly WarehouseStockPartition[],
  lines: readonly ComponentDemand[],
  now: DateTime.Utc,
  result: AllocateResult,
): boolean => {
  const live = liveAvailableBySku(stock, now)
  const exhausted = Arr.some(Arr.fromIterable(requestedBySku(lines).keys()), (sku) => (live.get(sku) ?? 0) === 0)
  return Result.match(result, {
    onFailure: () => exhausted,
    onSuccess: () => !exhausted,
  })
}

describe('allocateStock — conservation', () => {
  it.prop('∀l_AllocateStock_≤Stock', [S.Array(ComponentDemand), S.NonEmptyArray(StockLot)], ([lines, templates]) => {
    const stock = stockOf(lines, templates)
    return withinStock(stock, allocateStock(commandOf(lines, stock, earlierThanEveryExpiry(stock))))
  })

  it.prop(
    '∀l_AllocatedBackordered_=Requested',
    [S.Array(ComponentDemand), S.NonEmptyArray(StockLot)],
    ([lines, templates]) => {
      const stock = stockOf(lines, templates)
      return conserves(lines, allocateStock(commandOf(lines, stock, earlierThanEveryExpiry(stock))))
    },
  )
})

describe('allocateStock — expiry', () => {
  it.prop(
    '∀l_ExpiredLot_⊥',
    [S.NonEmptyArray(ComponentDemand), S.NonEmptyArray(StockLot)],
    ([lines, templates]) => {
      const now = DateTime.makeUnsafe(0)
      const stock = expireLotsAt(stockOf(lines, templates), now)
      return refusedWithZeroAvailability(allocateStock(commandOf(lines, stock, now)))
    },
  )

  it.prop(
    '∀(l,now)_Allocation_⊆Live',
    [S.Array(ComponentDemand), S.NonEmptyArray(StockLot), S.DateTimeUtc],
    ([lines, templates, now]) => {
      const stock = stockOf(lines, templates)
      const result = allocateStock(commandOf(lines, stock, now))
      return (
        onlyLiveReservations(stock, now, result) &&
        withinLiveStock(stock, now, result) &&
        refusalMatchesLiveAvailability(stock, lines, now, result) &&
        Result.match(result, {
          onFailure: () => true,
          onSuccess: () => conserves(lines, result),
        })
      )
    },
  )
})
