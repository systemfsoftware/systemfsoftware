import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { DateTime } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import {
  KitDefinition,
  LotId,
  Quantity,
  QuantityOnHand,
  SkuId,
  type StockLot,
  Version,
  WarehouseId,
  WarehouseStockPartition,
} from '../inventory/inventory.schema.js'
import { Amount, CreditAccount, CustomerTier } from './credit.schema.js'
import { OrderLine } from './order.schema.js'

const ExplodeDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/ExplodeBundleDecision',
)
type ExplodeDecisionTypeId = typeof ExplodeDecisionTypeId

const CreditDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/CreditCheckDecision',
)
type CreditDecisionTypeId = typeof CreditDecisionTypeId

const CreditErrorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/CreditCheckError',
)
type CreditErrorTypeId = typeof CreditErrorTypeId

const AllocationDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/AllocateStockDecision',
)
type AllocationDecisionTypeId = typeof AllocationDecisionTypeId

const AllocationErrorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/AllocateStockError',
)
type AllocationErrorTypeId = typeof AllocationErrorTypeId

const FulfillmentDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/SettleFulfillmentDecision',
)
type FulfillmentDecisionTypeId = typeof FulfillmentDecisionTypeId

export class ComponentDemand extends S.Class<ComponentDemand>('ComponentDemand')({
  sku: SkuId,
  quantity: Quantity,
}) {}

export class LotReservation extends S.Class<LotReservation>('LotReservation')({
  warehouseId: WarehouseId,
  lotId: LotId,
  sku: SkuId,
  quantity: Quantity,
  version: Version,
}) {}

export class UnfulfilledDemand extends S.Class<UnfulfilledDemand>('UnfulfilledDemand')({
  sku: SkuId,
  quantity: Quantity,
}) {}

export class BundleExploded extends S.TaggedClass<BundleExploded>()('BundleExploded', {
  components: S.Array(ComponentDemand),
}) {
  readonly [ExplodeDecisionTypeId] = ExplodeDecisionTypeId
}

export class NothingToExplode extends S.TaggedClass<NothingToExplode>()('NothingToExplode', {
  components: S.Array(ComponentDemand),
}) {
  readonly [ExplodeDecisionTypeId] = ExplodeDecisionTypeId
}

export class CreditGranted extends S.TaggedClass<CreditGranted>()('CreditGranted', {
  orderId: S.String,
  overdraftAmount: Amount,
}) {
  readonly [CreditDecisionTypeId] = CreditDecisionTypeId
}

export class CreditHold extends S.TaggedClass<CreditHold>()('CreditHold', {
  orderId: S.String,
  shortfall: Amount,
  requiredDownpayment: Amount,
}) {
  readonly [CreditDecisionTypeId] = CreditDecisionTypeId
}

export class CreditLimitExceeded extends S.TaggedError<CreditLimitExceeded>()('CreditLimitExceeded', {
  customerId: S.String,
  requested: Amount,
  available: Amount,
}) {
  readonly [CreditErrorTypeId] = CreditErrorTypeId
}

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
  requested: Quantity,
  available: QuantityOnHand,
}) {
  readonly [AllocationErrorTypeId] = AllocationErrorTypeId
}

export class OrderAllocated extends S.TaggedClass<OrderAllocated>()('OrderAllocated', {
  orderId: S.String,
  reservations: S.Array(LotReservation),
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class OrderAllocatedWithOverdraft extends S.TaggedClass<OrderAllocatedWithOverdraft>()(
  'OrderAllocatedWithOverdraft',
  {
    orderId: S.String,
    reservations: S.Array(LotReservation),
    overdraftAmount: Amount,
  },
) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class OrderBackordered extends S.TaggedClass<OrderBackordered>()('OrderBackordered', {
  orderId: S.String,
  reservations: S.Array(LotReservation),
  backordered: S.Array(UnfulfilledDemand),
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class OrderHeld extends S.TaggedClass<OrderHeld>()('OrderHeld', {
  orderId: S.String,
  shortfall: Amount,
  requiredDownpayment: Amount,
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export const SettleFulfillmentDecision = S.Union([
  OrderAllocated,
  OrderAllocatedWithOverdraft,
  OrderBackordered,
  OrderHeld,
])

export const SettleFulfillmentError = S.Union([InsufficientStock, CreditLimitExceeded])

export class PlaceOrderCommand extends S.Class<PlaceOrderCommand>('PlaceOrderCommand')({
  orderId: S.String,
  lines: S.Array(OrderLine),
  kits: S.Array(KitDefinition),
  tier: CustomerTier,
  account: CreditAccount,
  stock: S.Array(WarehouseStockPartition),
  now: S.DateTimeUtc,
}) {
  static readonly [Workflow.InstrumentationBrand] = { orderId: 'app.order.id', tier: 'app.credit.tier' } as const
}

const scaledDemands = (kit: KitDefinition, factor: number): readonly ComponentDemand[] =>
  Arr.map(
    kit.components,
    (component) => new ComponentDemand({ sku: component.sku, quantity: component.quantity * factor }),
  )

const componentsOfLine = (kits: readonly KitDefinition[], line: OrderLine): readonly ComponentDemand[] =>
  Match.value(Arr.findFirst(kits, (kit) => kit.kitSku === line.sku)).pipe(
    Match.tag('Some', (found) => scaledDemands(found.value, line.quantity)),
    Match.tag('None', () => Arr.of(new ComponentDemand({ sku: line.sku, quantity: line.quantity }))),
    Match.exhaustive,
  )

const explodedComponents = (lines: readonly OrderLine[], kits: readonly KitDefinition[]): readonly ComponentDemand[] =>
  Arr.flatMap(lines, (line) => componentsOfLine(kits, line))

const hasKitLine = (lines: readonly OrderLine[], kits: readonly KitDefinition[]): boolean =>
  Arr.some(lines, (line) => Arr.some(kits, (kit) => kit.kitSku === line.sku))

const explodeBundle = (
  lines: readonly OrderLine[],
  kits: readonly KitDefinition[],
): BundleExploded | NothingToExplode =>
  Match.value(hasKitLine(lines, kits)).pipe(
    Match.when(true, () => new BundleExploded({ components: explodedComponents(lines, kits) })),
    Match.when(false, () => new NothingToExplode({ components: explodedComponents(lines, kits) })),
    Match.exhaustive,
  )

const headroomOf = (account: CreditAccount): number => Num.max(0, account.creditLimit - account.outstandingBalance)

const shortfallOf = (requiredAmount: number, account: CreditAccount): number =>
  Num.max(0, requiredAmount - headroomOf(account))

const vipDecision = (
  orderId: string,
  account: CreditAccount,
  requiredAmount: number,
): Result.Result<CreditGranted | CreditHold, CreditLimitExceeded> => {
  const shortfall = shortfallOf(requiredAmount, account)
  return Match.value(shortfall <= account.overdraftPrivilege).pipe(
    Match.when(true, () => Result.succeed(new CreditGranted({ orderId, overdraftAmount: shortfall }))),
    Match.when(false, () =>
      Result.fail(
        new CreditLimitExceeded({
          customerId: account.customerId,
          requested: requiredAmount,
          available: headroomOf(account) + account.overdraftPrivilege,
        }),
      )),
    Match.exhaustive,
  )
}

const standardDecision = (
  orderId: string,
  account: CreditAccount,
  requiredAmount: number,
): Result.Result<CreditGranted | CreditHold, CreditLimitExceeded> => {
  const shortfall = shortfallOf(requiredAmount, account)
  return Match.value(shortfall === 0).pipe(
    Match.when(true, () => Result.succeed(new CreditGranted({ orderId, overdraftAmount: 0 }))),
    Match.when(false, () => Result.succeed(new CreditHold({ orderId, shortfall, requiredDownpayment: shortfall }))),
    Match.exhaustive,
  )
}

const checkCredit = (
  orderId: string,
  tier: CustomerTier,
  account: CreditAccount,
  requiredAmount: number,
): Result.Result<CreditGranted | CreditHold, CreditLimitExceeded> =>
  Match.type<CustomerTier>().pipe(
    Match.when('VIP', () => vipDecision(orderId, account, requiredAmount)),
    Match.when('Standard', () => standardDecision(orderId, account, requiredAmount)),
    Match.exhaustive,
  )(tier)

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

const isLive = (now: DateTime.Utc, lot: StockLot): boolean =>
  Option.getOrElse(
    Option.map(lot.expiresAt, (expiresAt) => expiresAt.epochMilliseconds > now.epochMilliseconds),
    () => true,
  )

const candidatesFor = (
  stock: readonly WarehouseStockPartition[],
  sku: SkuId,
  now: DateTime.Utc,
): readonly StockLot[] =>
  Arr.sortWith(
    Arr.filter(
      Arr.filter(Arr.flatMap(stock, (partition) => partition.lots), (lot) => lot.sku === sku),
      (lot) => isLive(now, lot),
    ),
    expiryKey,
    Order.Number,
  )

const availableFor = (stock: readonly WarehouseStockPartition[], sku: SkuId, now: DateTime.Utc): number =>
  Arr.reduce(candidatesFor(stock, sku, now), 0, (total, lot) => total + lot.quantityOnHand)

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
  now: DateTime.Utc,
): Option.Option<InsufficientStock> =>
  Match.value(Arr.findFirst(demands, (demand) => availableFor(stock, demand.sku, now) === 0)).pipe(
    Match.tag(
      'Some',
      (demand) =>
        Option.some(new InsufficientStock({ sku: demand.value.sku, requested: demand.value.requested, available: 0 })),
    ),
    Match.tag('None', () => Option.none()),
    Match.exhaustive,
  )

const allocatedOutcome = (
  orderId: string,
  stock: readonly WarehouseStockPartition[],
  now: DateTime.Utc,
  demands: readonly SkuDemand[],
): StockAllocated | StockBackordered => {
  const outcomes = Arr.map(demands, (demand) => ({
    demand,
    allocation: allocateSku(candidatesFor(stock, demand.sku, now), demand.requested),
  }))
  const reservations = Arr.flatMap(outcomes, (outcome) => outcome.allocation.reservations)
  const backordered = Arr.getSomes(
    Arr.map(outcomes, (outcome) => backorderOf({ sku: outcome.demand.sku, requested: outcome.allocation.backordered })),
  )
  return Match.value(backordered.length === 0).pipe(
    Match.when(true, () => new StockAllocated({ orderId, reservations })),
    Match.when(false, () => new StockBackordered({ orderId, reservations, backordered })),
    Match.exhaustive,
  )
}

const allocateStock = (
  orderId: string,
  lines: readonly ComponentDemand[],
  stock: readonly WarehouseStockPartition[],
  now: DateTime.Utc,
): Result.Result<StockAllocated | StockBackordered, InsufficientStock> => {
  const demands = demandsOf(lines)
  return Match.value(insufficientOf(stock, demands, now)).pipe(
    Match.tag('Some', (refusal) => Result.fail(refusal.value)),
    Match.tag('None', () => Result.succeed(allocatedOutcome(orderId, stock, now, demands))),
    Match.exhaustive,
  )
}

const settledDecision = (
  orderId: string,
  granted: CreditGranted,
  allocated: StockAllocated,
): OrderAllocated | OrderAllocatedWithOverdraft =>
  Match.value(granted.overdraftAmount === 0).pipe(
    Match.when(true, () => new OrderAllocated({ orderId, reservations: allocated.reservations })),
    Match.when(false, () =>
      new OrderAllocatedWithOverdraft({
        orderId,
        reservations: allocated.reservations,
        overdraftAmount: granted.overdraftAmount,
      })),
    Match.exhaustive,
  )

const settleFulfillment = (
  orderId: string,
  credit: CreditGranted | CreditHold,
  allocation: StockAllocated | StockBackordered,
): OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld =>
  Match.value(credit).pipe(
    Match.tag('CreditHold', (held) =>
      new OrderHeld({
        orderId,
        shortfall: held.shortfall,
        requiredDownpayment: held.requiredDownpayment,
      })),
    Match.tag('CreditGranted', (granted) =>
      Match.value(allocation).pipe(
        Match.tag('StockBackordered', (backordered) =>
          new OrderBackordered({
            orderId,
            reservations: backordered.reservations,
            backordered: backordered.backordered,
          })),
        Match.tag('StockAllocated', (allocated) => settledDecision(orderId, granted, allocated)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const placeOrder = Workflow.make({
  command: PlaceOrderCommand,
  decision: SettleFulfillmentDecision,
  error: SettleFulfillmentError,
  decide: (
    command,
  ): Result.Result<
    OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld,
    InsufficientStock | CreditLimitExceeded
  > => {
    const components = explodeBundle(command.lines, command.kits).components
    return Result.flatMap(
      checkCredit(
        command.orderId,
        command.tier,
        command.account,
        Arr.reduce(components, 0, (total, component) => total + component.quantity),
      ),
      (credit) =>
        Result.flatMap(
          allocateStock(command.orderId, components, command.stock, command.now),
          (allocation) => Result.succeed(settleFulfillment(command.orderId, credit, allocation)),
        ),
    )
  },
})
