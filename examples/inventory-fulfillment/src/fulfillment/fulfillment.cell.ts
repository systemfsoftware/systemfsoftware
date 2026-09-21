import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, DateTime, Effect, Match, Option, Result, Schema as S } from 'effect'
import type { SchemaError } from 'effect/Schema'
import {
  allocateStock,
  AllocateStockCommand,
  type InsufficientStock as AllocateInsufficientStock,
  type LotReservation,
} from '../inventory/allocate-stock.workflow.js'
import { type KitDefinition, LotAllocation, type WarehouseStockPartition } from '../inventory/inventory.schema.js'
import { InventoryStore } from '../inventory/InventoryStore.js'
import { CreditLedger } from '../ports/CreditLedger.js'
import { type ReservationCommit, type ReservationCommitOutcome, ReservationLog } from '../ports/ReservationLog.js'
import {
  checkCredit,
  CreditCheckCommand,
  type CreditLimitExceeded as CreditCheckLimitExceeded,
} from './check-credit.workflow.js'
import { type CreditAccount, type CustomerTier, type FraudRiskScore, Money } from './credit.schema.js'
import {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  type CreditAccountNotFound,
  CreditHold as WireCreditHold,
  CreditLimitExceeded as WireCreditLimitExceeded,
  type FulfillmentDecision,
  type FulfillmentError,
  InsufficientStock as WireInsufficientStock,
  OptimisticConflict,
} from './decision.schema.js'
import { AuditPayload, BackorderRecorded, type InventoryReservationEvents, StockReserved } from './event.schema.js'
import { type ComponentDemand, explodeBundle, ExplodeBundleCommand } from './explode-bundle.workflow.js'
import { type Order, OrderFulfillmentCommand, OrderLine } from './order.schema.js'
import {
  type OrderAllocated,
  type OrderAllocatedWithOverdraft,
  type OrderBackordered,
  type OrderHeld,
  settleFulfillment,
  SettleFulfillmentCommand,
} from './settle-fulfillment.workflow.js'

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

interface EncodedFulfillment {
  readonly decision: FulfillmentDecision | FulfillmentError
  readonly reservation?: ReservationPlan | undefined
}

type CoreDecision = OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld
type CoreError = AllocateInsufficientStock | CreditCheckLimitExceeded

const moneyOf = (value: number): Money => Result.getOrThrow(S.decodeResult(Money)(value))

const requiredAmountOf = (components: readonly ComponentDemand[]): number =>
  Arr.reduce(components, 0, (total, component) => total + component.quantity)

const allocationOf = (reservation: LotReservation): LotAllocation => new LotAllocation(reservation)

const allocationsOf = (reservations: readonly LotReservation[]): readonly LotAllocation[] =>
  Arr.map(reservations, allocationOf)

const lineOf = (demand: { readonly sku: OrderLine['sku']; readonly quantity: number }): OrderLine =>
  new OrderLine({ sku: demand.sku, quantity: demand.quantity })

const settlementOf = (command: OrderFulfillmentCommand): SettleFulfillmentCommand => {
  const exploded = Result.getOrThrow(
    explodeBundle(new ExplodeBundleCommand({ lines: command.order.lines, kits: command.kits })),
  )
  const allocation = Result.merge(
    allocateStock(
      new AllocateStockCommand({
        orderId: command.order.orderId,
        lines: exploded.components,
        stock: command.stock,
        now: command.now,
      }),
    ),
  )
  const credit = Result.merge(
    checkCredit(
      new CreditCheckCommand({
        orderId: command.order.orderId,
        tier: command.customerTier,
        account: command.credit,
        requiredAmount: requiredAmountOf(exploded.components),
      }),
    ),
  )
  return new SettleFulfillmentCommand({ orderId: command.order.orderId, credit, allocation })
}

const planOf = (
  decision: FulfillmentDecision,
  orderId: string,
  allocations: readonly LotAllocation[],
  backordered?: readonly OrderLine[],
): ReservationPlan => ({ orderId, decisionTag: decision._tag, allocations, backordered })

const persisted = (decision: FulfillmentDecision, reservation: ReservationPlan): EncodedFulfillment => ({
  decision,
  reservation,
})

const encodeCore = (decision: CoreDecision): EncodedFulfillment =>
  Match.value(decision).pipe(
    Match.tag('OrderAllocated', (allocated) => {
      const allocations = allocationsOf(allocated.reservations)
      const wire = new AllocatedSplit({ orderId: allocated.orderId, allocations })
      return persisted(wire, planOf(wire, allocated.orderId, allocations, undefined))
    }),
    Match.tag('OrderAllocatedWithOverdraft', (overdraft) => {
      const allocations = allocationsOf(overdraft.reservations)
      const wire = new AllocatedWithOverdraft({
        orderId: overdraft.orderId,
        allocations,
        overdraftAmount: moneyOf(overdraft.overdraftAmount),
      })
      return persisted(wire, planOf(wire, overdraft.orderId, allocations, undefined))
    }),
    Match.tag('OrderBackordered', (backordered) => {
      const allocations = allocationsOf(backordered.reservations)
      const lines = Arr.map(backordered.backordered, lineOf)
      const wire = new Backordered({ orderId: backordered.orderId, allocations, backorderedLines: lines })
      return persisted(wire, planOf(wire, backordered.orderId, allocations, lines))
    }),
    Match.tag('OrderHeld', (held) => {
      const wire = new WireCreditHold({
        orderId: held.orderId,
        shortfall: moneyOf(held.shortfall),
        requiredDownpayment: moneyOf(held.requiredDownpayment),
      })
      return persisted(wire, planOf(wire, held.orderId, [], undefined))
    }),
    Match.exhaustive,
  )

const encodeError = (error: CoreError): FulfillmentError =>
  Match.value(error).pipe(
    Match.tag('InsufficientStock', (insufficient) =>
      new WireInsufficientStock({
        sku: insufficient.sku,
        requested: insufficient.requested,
        available: insufficient.available,
      })),
    Match.tag('CreditLimitExceeded', (exceeded) =>
      new WireCreditLimitExceeded({
        customerId: exceeded.customerId,
        requested: moneyOf(exceeded.requested),
        available: moneyOf(exceeded.available),
      })),
    Match.exhaustive,
  )

const encodedOutcome = (outcome: Result.Result<CoreDecision, CoreError>): EncodedFulfillment =>
  Result.match(outcome, {
    onFailure: (error): EncodedFulfillment => ({ decision: encodeError(error), reservation: undefined }),
    onSuccess: encodeCore,
  })

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

const decodeContext = (raw: RawContext): Result.Result<SettleFulfillmentCommand, SchemaError> =>
  Result.map(S.decodeResult(OrderFulfillmentCommand)(raw), settlementOf)

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
const reservationCommitOf = (plan: ReservationPlan, raw: RawContext): ReservationCommit => ({
  orderId: plan.orderId,
  customerId: raw.order.customerId,
  events: reservationEventsOf(plan, raw.now),
  audit: new AuditPayload({
    orderId: plan.orderId,
    actorId: raw.order.customerId,
    decisionTag: plan.decisionTag,
    occurredAt: raw.now,
  }),
})

const commitReservation = (
  plan: ReservationPlan,
  raw: RawContext,
): Effect.Effect<ReservationCommitOutcome, never, ReservationLog> =>
  Effect.gen(function*() {
    const log = yield* ReservationLog
    return yield* log.commit(reservationCommitOf(plan, raw))
  })

const chargedAmountOf = (allocations: readonly LotAllocation[]): Money =>
  moneyOf(Arr.reduce(allocations, 0, (total, allocation) => total + allocation.quantity))

const chargeFor = (
  customerId: string,
  decision: FulfillmentDecision | FulfillmentError,
): Effect.Effect<void, never, CreditLedger> =>
  Match.value(decision).pipe(
    Match.tag('AllocatedSplit', (allocated) =>
      Effect.flatMap(CreditLedger, (ledger) =>
        ledger.charge(customerId, chargedAmountOf(allocated.allocations)))),
    Match.tag('AllocatedWithOverdraft', (overdraft) =>
      Effect.flatMap(CreditLedger, (ledger) =>
        ledger.charge(customerId, chargedAmountOf(overdraft.allocations)))),
    Match.tag('CreditHold', () =>
      Effect.void),
    Match.tag('Backordered', () =>
      Effect.void),
    Match.tag('ConflictRollback', () =>
      Effect.void),
    Match.tag('InsufficientStock', () => Effect.void),
    Match.tag('CreditLimitExceeded', () => Effect.void),
    Match.tag('Unauthorized', () => Effect.void),
    Match.tag('Forbidden', () => Effect.void),
    Match.exhaustive,
  )

const writeFulfillment = (encoded: EncodedFulfillment, raw: RawContext) =>
  Option.match(Option.fromUndefinedOr(encoded.reservation), {
    onNone: () => Effect.map(chargeFor(raw.order.customerId, encoded.decision), () => encoded.decision),
    onSome: (plan) =>
      Effect.flatMap(commitReservation(plan, raw), (outcome) =>
        Match.value(outcome).pipe(
          Match.when('VersionConflict', () => Effect.fail(new OptimisticConflict({}))),
          Match.when(
            'Committed',
            () => Effect.map(chargeFor(raw.order.customerId, encoded.decision), () => encoded.decision),
          ),
          Match.exhaustive,
        )),
  })

/**
 * The fulfillment sandwich. Callers run `fulfillmentCell.run(request)`.
 * CAS retries and per-customer gating live at the RPC edge (Effect.retry, CustomerGate).
 */
export const fulfillmentCell = Sandwich.read(readContext)
  .decode(Sandwich.pure(decodeContext))
  .decide(settleFulfillment)
  .encode(
    Sandwich.pure((outcome: Result.Result<CoreDecision, CoreError>): Result.Result<EncodedFulfillment, never> =>
      Result.succeed(encodedOutcome(outcome))
    ),
  )
  .write(writeFulfillment)
