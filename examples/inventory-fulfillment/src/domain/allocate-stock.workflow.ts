import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { ComponentDemand } from './explode-bundle.workflow.js'
import { LotId, SkuId, Version, WarehouseId, WarehouseStockPartition } from './inventory.schema.js'
import type { StockLot } from './inventory.schema.js'

const AllocationDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/AllocateStockDecision',
)
type AllocationDecisionTypeId = typeof AllocationDecisionTypeId

const AllocationErrorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/AllocateStockError',
)
type AllocationErrorTypeId = typeof AllocationErrorTypeId

const ReservationQuantity = S.Int.pipe(S.check(S.isGreaterThan(0)))

export class LotReservation extends S.Class<LotReservation>('LotReservation')({
  warehouseId: WarehouseId,
  lotId: LotId,
  sku: SkuId,
  quantity: ReservationQuantity,
  version: Version,
}) {}

export class UnfulfilledDemand extends S.Class<UnfulfilledDemand>('UnfulfilledDemand')({
  sku: SkuId,
  quantity: ReservationQuantity,
}) {}

export class StockAllocated extends S.TaggedClass<StockAllocated>()('StockAllocated', {
  orderId: S.String,
  reservations: S.Array(LotReservation),
}) {
  readonly [AllocationDecisionTypeId] = AllocationDecisionTypeId
}

export class StockBackordered extends S.TaggedClass<StockBackordered>()('StockBackordered', {
  orderId: S.String,
  reservations: S.Array(LotReservation),
  backordered: S.Array(UnfulfilledDemand),
}) {
  readonly [AllocationDecisionTypeId] = AllocationDecisionTypeId
}

export class InsufficientStock extends S.TaggedError<InsufficientStock>()('InsufficientStock', {
  sku: SkuId,
  requested: S.Int,
  available: S.Int,
}) {
  readonly [AllocationErrorTypeId] = AllocationErrorTypeId
}

export class AllocateStockCommand extends S.Class<AllocateStockCommand>('AllocateStockCommand')({
  orderId: S.String,
  lines: S.Array(ComponentDemand),
  stock: S.Array(WarehouseStockPartition),
}) {}

interface SkuDemand {
  readonly sku: SkuId
  readonly requested: number
}

interface AllocationState {
  readonly requested: number
  readonly reservations: readonly LotReservation[]
}

interface SkuAllocation {
  readonly reservations: readonly LotReservation[]
  readonly backordered: number
}

const emptyDemands: readonly SkuDemand[] = []
const emptyReservations: readonly LotReservation[] = []

const expiryKey = (lot: StockLot): number =>
  Option.getOrElse(
    Option.map(lot.expiresAt, (expiresAt) => expiresAt.epochMilliseconds),
    () => Number.POSITIVE_INFINITY,
  )

const candidatesFor = (stock: readonly WarehouseStockPartition[], sku: SkuId): readonly StockLot[] =>
  Arr.sortWith(
    Arr.filter(Arr.flatMap(stock, (partition) => partition.lots), (lot) => lot.sku === sku),
    expiryKey,
    Order.Number,
  )

const availableFor = (stock: readonly WarehouseStockPartition[], sku: SkuId): number =>
  Arr.reduce(candidatesFor(stock, sku), 0, (total, lot) => total + lot.quantityOnHand)

const mergeDemand = (demands: readonly SkuDemand[], line: ComponentDemand): readonly SkuDemand[] =>
  Match.value(Arr.some(demands, (demand) => demand.sku === line.sku)).pipe(
    Match.when(true, () =>
      Arr.map(demands, (demand) =>
        Match.value(demand.sku === line.sku).pipe(
          Match.when(true, () => ({ sku: demand.sku, requested: demand.requested + line.quantity })),
          Match.when(false, () => demand),
          Match.exhaustive,
        ))),
    Match.when(false, () => Arr.append(demands, { sku: line.sku, requested: line.quantity })),
    Match.exhaustive,
  )

const demandsOf = (lines: readonly ComponentDemand[]): readonly SkuDemand[] =>
  Arr.reduce(lines, emptyDemands, mergeDemand)

const reservationOf = (lot: StockLot, quantity: number): Option.Option<LotReservation> =>
  Match.value(quantity > 0).pipe(
    Match.when(true, () =>
      Option.some(
        new LotReservation({
          warehouseId: lot.warehouseId,
          lotId: lot.lotId,
          sku: lot.sku,
          quantity,
          version: lot.version,
        }),
      )),
    Match.when(false, () => Option.none()),
    Match.exhaustive,
  )

const consumeLot = (state: AllocationState, lot: StockLot): AllocationState => {
  const quantity = Num.min(lot.quantityOnHand, state.requested)
  return {
    requested: state.requested - quantity,
    reservations: Option.match(reservationOf(lot, quantity), {
      onNone: () => state.reservations,
      onSome: (reservation) => Arr.append(state.reservations, reservation),
    }),
  }
}

const allocateSku = (lots: readonly StockLot[], requested: number): SkuAllocation => {
  const state = Arr.reduce(lots, { requested, reservations: emptyReservations }, consumeLot)
  return { reservations: state.reservations, backordered: state.requested }
}

const backorderOf = (demand: SkuDemand): Option.Option<UnfulfilledDemand> =>
  Match.value(demand.requested > 0).pipe(
    Match.when(true, () => Option.some(new UnfulfilledDemand({ sku: demand.sku, quantity: demand.requested }))),
    Match.when(false, () => Option.none()),
    Match.exhaustive,
  )

const insufficientOf = (
  stock: readonly WarehouseStockPartition[],
  demands: readonly SkuDemand[],
): Option.Option<InsufficientStock> =>
  Match.value(Arr.findFirst(demands, (demand) => availableFor(stock, demand.sku) === 0)).pipe(
    Match.tag(
      'Some',
      (demand) =>
        Option.some(new InsufficientStock({ sku: demand.value.sku, requested: demand.value.requested, available: 0 })),
    ),
    Match.tag('None', () => Option.none()),
    Match.exhaustive,
  )

const allocatedOutcome = (
  command: AllocateStockCommand,
  demands: readonly SkuDemand[],
): StockAllocated | StockBackordered => {
  const outcomes = Arr.map(demands, (demand) => ({
    demand,
    allocation: allocateSku(candidatesFor(command.stock, demand.sku), demand.requested),
  }))
  const reservations = Arr.flatMap(outcomes, (outcome) => outcome.allocation.reservations)
  const backordered = Arr.getSomes(
    Arr.map(outcomes, (outcome) => backorderOf({ sku: outcome.demand.sku, requested: outcome.allocation.backordered })),
  )
  return Match.value(backordered.length === 0).pipe(
    Match.when(true, () => new StockAllocated({ orderId: command.orderId, reservations })),
    Match.when(false, () => new StockBackordered({ orderId: command.orderId, reservations, backordered })),
    Match.exhaustive,
  )
}

export const allocateStock = Workflow.make(
  AllocateStockCommand,
  (command): Result.Result<StockAllocated | StockBackordered, InsufficientStock> => {
    const demands = demandsOf(command.lines)
    return Match.value(insufficientOf(command.stock, demands)).pipe(
      Match.tag('Some', (refusal) => Result.fail(refusal.value)),
      Match.tag('None', () => Result.succeed(allocatedOutcome(command, demands))),
      Match.exhaustive,
    )
  },
)
