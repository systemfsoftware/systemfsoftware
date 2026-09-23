import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Array as Arr, DateTime, Effect, Match, Option, Result, Schema as S } from 'effect'
import {
  allocateStock,
  AllocateStockCommand,
  LotReservation,
  UnfulfilledDemand,
} from '../inventory/allocate-stock.workflow.js'
import {
  type KitDefinition,
  LotAllocation,
  SkuId,
  type WarehouseStockPartition,
} from '../inventory/inventory.schema.js'
import { InventoryStore } from '../inventory/InventoryStore.js'
import { CreditLedger } from '../ports/CreditLedger.js'
import { type ReservationCommit, type ReservationCommitOutcome, ReservationLog } from '../ports/ReservationLog.js'
import { checkCredit, CreditCheckCommand } from './check-credit.workflow.js'
import { type CreditAccount, type CustomerTier, type FraudRiskScore, Money } from './credit.schema.js'
import {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  type CreditAccountNotFound,
  CreditHold as WireCreditHold,
  CreditLimitExceeded as WireCreditLimitExceeded,
  type FulfillmentDecision,
  InsufficientStock as WireInsufficientStock,
  OptimisticConflict,
} from './decision.schema.js'
import { AuditPayload, BackorderRecorded, type InventoryReservationEvents, StockReserved } from './event.schema.js'
import { type ComponentDemand, explodeBundle, ExplodeBundleCommand } from './explode-bundle.workflow.js'
import { CreditCharge, FulfillmentSettle, ReservationCommit as ReservationCommitSpan } from './FulfillmentTaxonomy.js'
import { type Order, OrderLine } from './order.schema.js'
import { settleFulfillment, SettleFulfillmentCommand } from './settle-fulfillment.workflow.js'

export interface FulfillmentRequest {
  readonly order: Order
  readonly kits: readonly KitDefinition[]
  readonly fraudRisk: FraudRiskScore
}

interface RawContext {
  readonly order: Order
  readonly customerTier: CustomerTier
  readonly fraudRisk: FraudRiskScore
  readonly credit: CreditAccount
  readonly stock: readonly WarehouseStockPartition[]
  readonly kits: readonly KitDefinition[]
  readonly now: DateTime.Utc
}

interface ReservationPlan {
  readonly orderId: string
  readonly decisionTag: string
  readonly allocations: readonly LotAllocation[]
  readonly backordered?: readonly OrderLine[] | undefined
}

/** Who the charge and the audit event are written for, and when: what the write needs that the pure command does not carry. */
interface SettlementWriteContext {
  readonly customerId: string
  readonly now: DateTime.Utc
}

/**
 * What `read` hands the cell: the settle command in its encoded form, plus the write
 * context. The library decodes the command's own fields for `decide`, and every handler
 * receives this value whole, so the context rides beside the command instead of inside it.
 */
type SettlementRead = (typeof SettleFulfillmentCommand)['Encoded'] & SettlementWriteContext

type EncodedReservation = (typeof LotReservation)['Encoded']
type EncodedDemand = (typeof UnfulfilledDemand)['Encoded']

const moneyOf = (value: number): Money => Result.getOrThrow(S.decodeResult(Money)(value))

const requiredAmountOf = (components: readonly ComponentDemand[]): number =>
  Arr.reduce(components, 0, (total, component) => total + component.quantity)

const wireAllocationsOf = (reservations: ReadonlyArray<EncodedReservation>): readonly LotAllocation[] =>
  Result.getOrThrow(S.decodeResult(S.Array(LotAllocation))(reservations))

const wireLinesOf = (demands: ReadonlyArray<EncodedDemand>): readonly OrderLine[] =>
  Result.getOrThrow(S.decodeResult(S.Array(OrderLine))(demands))

const skuIdOf = (sku: string): SkuId => Result.getOrThrow(S.decodeResult(SkuId)(sku))

const settlementOf = (raw: RawContext): SettleFulfillmentCommand => {
  const exploded = Result.getOrThrow(
    explodeBundle(new ExplodeBundleCommand({ lines: raw.order.lines, kits: raw.kits })),
  )
  const allocation = Result.merge(
    allocateStock(
      new AllocateStockCommand({
        orderId: raw.order.orderId,
        lines: exploded.components,
        stock: raw.stock,
        now: raw.now,
      }),
    ),
  )
  const credit = Result.merge(
    checkCredit(
      new CreditCheckCommand({
        orderId: raw.order.orderId,
        tier: raw.customerTier,
        account: raw.credit,
        requiredAmount: requiredAmountOf(exploded.components),
      }),
    ),
  )
  return new SettleFulfillmentCommand({ orderId: raw.order.orderId, credit, allocation })
}

const planOf = (
  decision: FulfillmentDecision,
  orderId: string,
  allocations: readonly LotAllocation[],
  backordered?: readonly OrderLine[],
): ReservationPlan => ({ orderId, decisionTag: decision._tag, allocations, backordered })

const readContext = (
  request: FulfillmentRequest,
): Effect.Effect<RawContext, CreditAccountNotFound, InventoryStore | CreditLedger> =>
  Effect.gen(function*() {
    const inventory = yield* InventoryStore
    const creditLedger = yield* CreditLedger
    const [stock, credit, now] = yield* Effect.all(
      [inventory.readAllStock, creditLedger.readCredit(request.order.customerId), DateTime.now],
      { concurrency: 'unbounded' },
    ).pipe(Effect.catchTag(['SchemaError', 'EffectDrizzleQueryError'], (error) => Effect.die(error)))
    return {
      order: request.order,
      customerTier: credit.tier,
      fraudRisk: request.fraudRisk,
      credit: credit.account,
      stock,
      kits: request.kits,
      now,
    }
  })

const readSettlement = (
  request: FulfillmentRequest,
): Effect.Effect<SettlementRead, CreditAccountNotFound, InventoryStore | CreditLedger> =>
  Effect.map(readContext(request), (raw): SettlementRead => {
    const settlement = settlementOf(raw)
    return {
      orderId: settlement.orderId,
      credit: settlement.credit,
      allocation: settlement.allocation,
      customerId: raw.order.customerId,
      now: raw.now,
    }
  })

const stockReservedOf = (plan: ReservationPlan, now: DateTime.Utc): Option.Option<StockReserved> =>
  Match.value(plan.allocations.length === 0).pipe(
    Match.when(true, () => Option.none<StockReserved>()),
    Match.when(
      false,
      () => Option.some(new StockReserved({ orderId: plan.orderId, allocations: plan.allocations, occurredAt: now })),
    ),
    Match.exhaustive,
  )

const backorderRecordedOf = (plan: ReservationPlan, now: DateTime.Utc): Option.Option<BackorderRecorded> =>
  Option.map(
    Option.fromUndefinedOr(plan.backordered),
    (lines) => new BackorderRecorded({ orderId: plan.orderId, backorderedLines: lines, occurredAt: now }),
  )

const reservationEventsOf = (plan: ReservationPlan, now: DateTime.Utc): readonly InventoryReservationEvents[] =>
  Arr.getSomes([stockReservedOf(plan, now), backorderRecordedOf(plan, now)])

const reservationCommitOf = (plan: ReservationPlan, context: SettlementWriteContext): ReservationCommit => ({
  orderId: plan.orderId,
  customerId: context.customerId,
  events: reservationEventsOf(plan, context.now),
  audit: new AuditPayload({
    orderId: plan.orderId,
    actorId: context.customerId,
    decisionTag: plan.decisionTag,
    occurredAt: context.now,
  }),
})

const commitReservation = (
  plan: ReservationPlan,
  context: SettlementWriteContext,
): Effect.Effect<ReservationCommitOutcome, never, ReservationLog> => {
  const commit = reservationCommitOf(plan, context)
  return Effect.flatMap(ReservationLog, (log) => log.commit(commit)).pipe(
    Span.start(ReservationCommitSpan, {
      'app.customer.id': context.customerId,
      'app.order.id': plan.orderId,
      'app.reservation.event.count': commit.events.length,
    }),
  )
}

const chargedAmountOf = (allocations: readonly LotAllocation[]): Money =>
  moneyOf(Arr.reduce(allocations, 0, (total, allocation) => total + allocation.quantity))

const chargeCredit = (customerId: string, allocations: readonly LotAllocation[]) => {
  const amount = chargedAmountOf(allocations)
  return Effect.flatMap(CreditLedger, (ledger) => ledger.charge(customerId, amount)).pipe(
    Span.start(CreditCharge, { 'app.charge.amount': Number(amount), 'app.customer.id': customerId }),
  )
}

const chargeFor = (
  customerId: string,
  decision: FulfillmentDecision,
): Effect.Effect<void, never, CreditLedger> =>
  Match.value(decision).pipe(
    Match.tag('AllocatedSplit', (allocated) => chargeCredit(customerId, allocated.allocations)),
    Match.tag('AllocatedWithOverdraft', (overdraft) => chargeCredit(customerId, overdraft.allocations)),
    Match.tag('Backordered', 'ConflictRollback', 'CreditHold', () => Effect.void),
    Match.exhaustive,
  )

const persistReservation = (
  wire: FulfillmentDecision,
  plan: ReservationPlan,
  context: SettlementWriteContext,
): Effect.Effect<FulfillmentDecision, OptimisticConflict, CreditLedger | ReservationLog> =>
  Effect.flatMap(commitReservation(plan, context), (outcome) =>
    Match.value(outcome).pipe(
      Match.when('VersionConflict', () => Effect.fail(new OptimisticConflict({}))),
      Match.when('Committed', () => Effect.map(chargeFor(context.customerId, wire), () => wire)),
      Match.exhaustive,
    ))

/**
 * The fulfillment sandwich. Callers run `fulfillmentCell.run(request)`.
 * CAS retries and per-customer gating live at the RPC edge (Effect.retry, CustomerGate).
 */
export const fulfillmentCell = Sandwich.named(FulfillmentSettle.name)(readSettlement)
  .decide(settleFulfillment)
  .write({
    OrderAllocated: (allocated, context) => {
      const allocations = wireAllocationsOf(allocated.reservations)
      const wire = new AllocatedSplit({ orderId: allocated.orderId, allocations })
      return persistReservation(wire, planOf(wire, allocated.orderId, allocations), context)
    },
    OrderAllocatedWithOverdraft: (overdraft, context) => {
      const allocations = wireAllocationsOf(overdraft.reservations)
      const wire = new AllocatedWithOverdraft({
        orderId: overdraft.orderId,
        allocations,
        overdraftAmount: moneyOf(overdraft.overdraftAmount),
      })
      return persistReservation(wire, planOf(wire, overdraft.orderId, allocations), context)
    },
    OrderBackordered: (backordered, context) => {
      const allocations = wireAllocationsOf(backordered.reservations)
      const lines = wireLinesOf(backordered.backordered)
      const wire = new Backordered({ orderId: backordered.orderId, allocations, backorderedLines: lines })
      return persistReservation(wire, planOf(wire, backordered.orderId, allocations, lines), context)
    },
    OrderHeld: (held, context) => {
      const wire = new WireCreditHold({
        orderId: held.orderId,
        shortfall: moneyOf(held.shortfall),
        requiredDownpayment: moneyOf(held.requiredDownpayment),
      })
      return persistReservation(wire, planOf(wire, held.orderId, []), context)
    },
    InsufficientStock: (insufficient) =>
      Effect.succeed(
        new WireInsufficientStock({
          sku: skuIdOf(insufficient.sku),
          requested: insufficient.requested,
          available: insufficient.available,
        }),
      ),
    CreditLimitExceeded: (exceeded) =>
      Effect.succeed(
        new WireCreditLimitExceeded({
          customerId: exceeded.customerId,
          requested: moneyOf(exceeded.requested),
          available: moneyOf(exceeded.available),
        }),
      ),
    CommandRejected: (rejected) =>
      Effect.die(new Error(`the fulfillment command the cell read failed its own schema: ${rejected.issue}`)),
  })
