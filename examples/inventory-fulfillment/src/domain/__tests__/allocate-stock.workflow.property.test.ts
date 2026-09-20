import { describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { allocateStock, AllocateStockCommand, StockAllocated, StockBackordered } from '../allocate-stock.workflow.js'
import type { InsufficientStock, LotReservation } from '../allocate-stock.workflow.js'
import { ComponentDemand } from '../explode-bundle.workflow.js'
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
): AllocateStockCommand => new AllocateStockCommand({ orderId: 'order-1', lines, stock })

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
    onFailure: () => false,
    onSuccess: (decision) => {
      const { allocated } = summaryOf(decision)
      const available = availableBySku(stock)
      return Arr.every(skusOf(allocated), (sku) => (allocated.get(sku) ?? 0) <= (available.get(sku) ?? 0))
    },
  })

const conserves = (lines: readonly ComponentDemand[], result: AllocateResult): boolean =>
  Result.match(result, {
    onFailure: () => false,
    onSuccess: (decision) => {
      const summary = summaryOf(decision)
      const requested = requestedBySku(lines)
      return Arr.every(skusOf(requested, summary.allocated, summary.backordered), (sku) =>
        (summary.allocated.get(sku) ?? 0) + (summary.backordered.get(sku) ?? 0) === (requested.get(sku) ?? 0))
    },
  })

describe('allocateStock — conservation', () => {
  it.prop('∀l_AllocateStock_≤Stock', [S.Array(ComponentDemand), S.NonEmptyArray(StockLot)], ([lines, templates]) => {
    const stock = stockOf(lines, templates)
    return withinStock(stock, allocateStock(commandOf(lines, stock)))
  })

  it.prop(
    '∀l_AllocatedBackordered_=Requested',
    [S.Array(ComponentDemand), S.NonEmptyArray(StockLot)],
    ([lines, templates]) => {
      const stock = stockOf(lines, templates)
      return conserves(lines, allocateStock(commandOf(lines, stock)))
    },
  )
})
