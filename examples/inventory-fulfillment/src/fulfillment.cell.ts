import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, type DateTime, Effect, Match, Option, Result, Schema as S } from 'effect'
import type { SchemaError } from 'effect/Schema'
import {
  allocateStock,
  AllocateStockCommand,
  type InsufficientStock as AllocateInsufficientStock,
  type LotReservation,
} from './domain/allocate-stock.workflow.js'
import {
  checkCredit,
  CreditCheckCommand,
  type CreditLimitExceeded as CreditCheckLimitExceeded,
} from './domain/check-credit.workflow.js'
import { type CreditAccount, type CustomerTier, type FraudRiskScore, Money } from './domain/credit.schema.js'
import {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  ConflictRollback,
  CreditHold as WireCreditHold,
  CreditLimitExceeded as WireCreditLimitExceeded,
  type FulfillmentDecision,
  type FulfillmentError,
  InsufficientStock as WireInsufficientStock,
} from './domain/decision.schema.js'
import {
  AuditPayload,
  BackorderRecorded,
  type InventoryReservationEvents,
  ReservationRolledBack,
  StockReserved,
} from './domain/event.schema.js'
import { type ComponentDemand, explodeBundle, ExplodeBundleCommand } from './domain/explode-bundle.workflow.js'
import { type KitDefinition, LotAllocation, type WarehouseStockPartition } from './domain/inventory.schema.js'
import { type Order, OrderFulfillmentCommand, OrderLine } from './domain/order.schema.js'
import {
  type OrderAllocated,
  type OrderAllocatedWithOverdraft,
  type OrderBackordered,
  type OrderHeld,
  settleFulfillment,
  SettleFulfillmentCommand,
} from './domain/settle-fulfillment.workflow.js'
import { CreditLedger } from './ports/CreditLedger.js'
import { InventoryStore } from './ports/InventoryStore.js'
import { NowClock } from './ports/NowClock.js'
import { type ReservationCommit, type ReservationCommitOutcome, ReservationLog } from './ports/ReservationLog.js'

export interface FulfillmentRequest {
  readonly order: Order
  readonly kits: readonly KitDefinition[]
  readonly fraudRisk: FraudRiskScore
}

type FulfillmentPorts = InventoryStore | CreditLedger | ReservationLog | NowClock

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
  readonly backordered: Option.Option<readonly OrderLine[]>
}

interface EncodedFulfillment {
  readonly decision: FulfillmentDecision | FulfillmentError
  readonly reservation: Option.Option<ReservationPlan>
}

interface FulfillmentAttempt {
  readonly decision: FulfillmentDecision | FulfillmentError
  readonly commit: Option.Option<ReservationCommitOutcome>
  readonly now: DateTime.Utc
}

type CoreDecision = OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld
type CoreError = AllocateInsufficientStock | CreditCheckLimitExceeded

const maxAttempts = 3

const rollbackReason = 'optimistic concurrency conflict: retry budget exhausted'

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
  decisionTag: string,
  orderId: string,
  allocations: readonly LotAllocation[],
  backordered: Option.Option<readonly OrderLine[]>,
): ReservationPlan => ({ orderId, decisionTag, allocations, backordered })

const persisted = (decision: FulfillmentDecision, reservation: ReservationPlan): EncodedFulfillment => ({
  decision,
  reservation: Option.some(reservation),
})

const encodeCore = (decision: CoreDecision): EncodedFulfillment =>
  Match.value(decision).pipe(
    Match.tag('OrderAllocated', (allocated) => {
      const allocations = allocationsOf(allocated.reservations)
      return persisted(
        new AllocatedSplit({ orderId: allocated.orderId, allocations }),
        planOf('AllocatedSplit', allocated.orderId, allocations, Option.none()),
      )
    }),
    Match.tag('OrderAllocatedWithOverdraft', (overdraft) => {
      const allocations = allocationsOf(overdraft.reservations)
      return persisted(
        new AllocatedWithOverdraft({
          orderId: overdraft.orderId,
          allocations,
          overdraftAmount: moneyOf(overdraft.overdraftAmount),
        }),
        planOf('AllocatedWithOverdraft', overdraft.orderId, allocations, Option.none()),
      )
    }),
    Match.tag('OrderBackordered', (backordered) => {
      const allocations = allocationsOf(backordered.reservations)
      const lines = Arr.map(backordered.backordered, lineOf)
      return persisted(
        new Backordered({ orderId: backordered.orderId, allocations, backorderedLines: lines }),
        planOf('Backordered', backordered.orderId, allocations, Option.some(lines)),
      )
    }),
    Match.tag('OrderHeld', (held) =>
      persisted(
        new WireCreditHold({
          orderId: held.orderId,
          shortfall: moneyOf(held.shortfall),
          requiredDownpayment: moneyOf(held.requiredDownpayment),
        }),
        planOf('CreditHold', held.orderId, [], Option.none()),
      )),
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
    onFailure: (error): EncodedFulfillment => ({ decision: encodeError(error), reservation: Option.none() }),
    onSuccess: encodeCore,
  })

const readContext = (
  request: FulfillmentRequest,
): Effect.Effect<RawContext, never, InventoryStore | CreditLedger | NowClock> =>
  Effect.gen(function*() {
    const inventory = yield* InventoryStore
    const creditLedger = yield* CreditLedger
    const clock = yield* NowClock
    const stock = yield* inventory.readAllStock
    const credit = yield* creditLedger.readCredit(request.order.customerId)
    const now = yield* clock.now
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
    plan.backordered,
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

const attemptOf = (
  decision: FulfillmentDecision | FulfillmentError,
  commit: Option.Option<ReservationCommitOutcome>,
  now: DateTime.Utc,
): FulfillmentAttempt => ({ decision, commit, now })

const cell = Sandwich.read(readContext)
  .decode(Sandwich.pure(decodeContext))
  .decide(settleFulfillment)
  .encode(
    Sandwich.pure((outcome: Result.Result<CoreDecision, CoreError>): Result.Result<EncodedFulfillment, never> =>
      Result.succeed(encodedOutcome(outcome))
    ),
  )
  .write((encoded: EncodedFulfillment, raw: RawContext) =>
    Option.match(encoded.reservation, {
      onNone: () => Effect.succeed(attemptOf(encoded.decision, Option.none(), raw.now)),
      onSome: (plan) =>
        Effect.map(
          commitReservation(plan, raw),
          (outcome) => attemptOf(encoded.decision, Option.some(outcome), raw.now),
        ),
    })
  )

const runAttempt = (request: FulfillmentRequest): Effect.Effect<FulfillmentAttempt, never, FulfillmentPorts> =>
  cell.run(request).pipe(Effect.orDie)

const commitRollback = (
  request: FulfillmentRequest,
  now: DateTime.Utc,
): Effect.Effect<ReservationCommitOutcome, never, ReservationLog> =>
  Effect.gen(function*() {
    const log = yield* ReservationLog
    return yield* log.commit({
      orderId: request.order.orderId,
      customerId: request.order.customerId,
      events: [
        new ReservationRolledBack({
          orderId: request.order.orderId,
          reason: rollbackReason,
          allocations: [],
          occurredAt: now,
        }),
      ],
      audit: new AuditPayload({
        orderId: request.order.orderId,
        actorId: request.order.customerId,
        decisionTag: 'ConflictRollback',
        occurredAt: now,
      }),
    })
  })

const rollback = (
  request: FulfillmentRequest,
  attempt: FulfillmentAttempt,
  attempts: number,
): Effect.Effect<ConflictRollback, never, ReservationLog> =>
  Effect.map(
    commitRollback(request, attempt.now),
    () => new ConflictRollback({ orderId: request.order.orderId, attempts }),
  )

function submitWithRetry(
  request: FulfillmentRequest,
  attemptNumber: number,
): Effect.Effect<FulfillmentDecision | FulfillmentError, never, FulfillmentPorts> {
  return Effect.flatMap(runAttempt(request), (attempt) =>
    Option.match(attempt.commit, {
      onNone: () => Effect.succeed(attempt.decision),
      onSome: (outcome) =>
        Match.value(outcome === 'VersionConflict').pipe(
          Match.when(true, () =>
            Match.value(attemptNumber < maxAttempts).pipe(
              Match.when(true, () => submitWithRetry(request, attemptNumber + 1)),
              Match.when(false, () => rollback(request, attempt, attemptNumber)),
              Match.exhaustive,
            )),
          Match.when(false, () => Effect.succeed(attempt.decision)),
          Match.exhaustive,
        ),
    }))
}

/**
 * The fulfillment cell: reads stock/credit/clock, decodes and decides purely, encodes the wire
 * decision and its reservation events, then commits with an optimistic-concurrency CAS. A
 * `VersionConflict` re-runs the whole sandwich from a fresh read, bounded to {@link maxAttempts}
 * total attempts, after which the shell returns the `ConflictRollback` decision and writes a
 * `ReservationRolledBack` compensation record.
 */
export const runFulfillment = (
  request: FulfillmentRequest,
): Effect.Effect<FulfillmentDecision | FulfillmentError, never, FulfillmentPorts> => submitWithRetry(request, 1)
