import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Array as Arr, DateTime, Effect, Match, Option, Result, Schema as S } from 'effect'
import type { KitDefinition, LotAllocation } from '../inventory/inventory.schema.js'
import * as SettlementUnit from '../ports/settlement-unit.handle.js'
import type { OrderPlan } from '../ports/settlement-unit.handle.js'
import { type Money, Money as MoneySchema } from './credit.schema.js'
import { DuplicateOrder, Forbidden, FulfillmentDecision, FulfillmentRefusal } from './decision.schema.js'
import { AuditPayload, BackorderRecorded, type InventoryReservationEvents, StockReserved } from './event.schema.js'
import { CreditCharge, PlaceOrder, ReservationCommit } from './FulfillmentTaxonomy.js'
import type { OrderLine } from './order.schema.js'
import {
  placeOrder,
  PlaceOrderCommand,
  SettleFulfillmentDecision,
  SettleFulfillmentError,
} from './place-order.workflow.js'

export interface PlaceOrderRequest {
  readonly orderId: string
  readonly customerId: string
  readonly lines: readonly OrderLine[]
  readonly kits: readonly KitDefinition[]
}

type PlaceOrderRead = (typeof PlaceOrderCommand)['Encoded']
type SettleDecisionEncoded = (typeof SettleFulfillmentDecision)['Encoded']
type SettleErrorEncoded = (typeof SettleFulfillmentError)['Encoded']
type WireDecisionEncoded = (typeof FulfillmentDecision)['Encoded']

const moneyOf = (value: number): Money => Result.getOrThrow(S.decodeResult(MoneySchema)(value))

/**
 * Every SKU whose lots the decision may draw on: the ordered lines and the components of the
 * kits they name. A kit's own SKU is read too, which costs a lot read the allocation ignores.
 */
const skusOf = (request: PlaceOrderRequest): readonly string[] =>
  Arr.dedupe([
    ...Arr.map(request.lines, (line) => line.sku),
    ...Arr.flatMap(request.kits, (kit) => Arr.map(kit.components, (component) => component.sku)),
  ])

/** The settle decision's fields under the names the wire contract gives them, still encoded. */
const wireEncodedOf = (decision: SettleDecisionEncoded): WireDecisionEncoded =>
  Match.value(decision).pipe(
    Match.tag('OrderAllocated', ({ orderId, reservations }): WireDecisionEncoded => ({
      _tag: 'AllocatedSplit',
      orderId,
      allocations: reservations,
    })),
    Match.tag('OrderAllocatedWithOverdraft', ({ orderId, reservations, overdraftAmount }): WireDecisionEncoded => ({
      _tag: 'AllocatedWithOverdraft',
      orderId,
      allocations: reservations,
      overdraftAmount,
    })),
    Match.tag('OrderBackordered', ({ orderId, reservations, backordered }): WireDecisionEncoded => ({
      _tag: 'Backordered',
      orderId,
      allocations: reservations,
      backorderedLines: backordered,
    })),
    Match.tag('OrderHeld', ({ orderId, shortfall, requiredDownpayment }): WireDecisionEncoded => ({
      _tag: 'CreditHold',
      orderId,
      shortfall,
      requiredDownpayment,
    })),
    Match.exhaustive,
  )

/**
 * The one place a settle outcome becomes the RPC's wire value. Both schemas live in this
 * example, so a decode failure is a mismatch between them, a defect rather than a refusal.
 */
const wireDecisionOf = (decision: SettleDecisionEncoded): Effect.Effect<FulfillmentDecision> =>
  Effect.orDie(S.decodeEffect(FulfillmentDecision)(wireEncodedOf(decision)))

/** Each settle refusal shares its tag and fields with the wire refusal the RPC answers, so it decodes as it is. */
const refuse = (error: SettleErrorEncoded): Effect.Effect<FulfillmentRefusal> =>
  Effect.orDie(S.decodeEffect(FulfillmentRefusal)(error))

const rejectedRead = (rejected: Sandwich.CommandRejected): Effect.Effect<never> =>
  Effect.die(new Error(`the place-order command built from loaded rows failed its own schema: ${rejected.issue}`))

/**
 * A reservation for this order id belongs to one caller. Its owner submitted the same order
 * twice; anyone else is naming an order that is not theirs.
 */
const reservationRefusal = (owner: string, request: PlaceOrderRequest): DuplicateOrder | Forbidden =>
  Match.value(owner === request.customerId).pipe(
    Match.when(true, () => new DuplicateOrder({ orderId: request.orderId, reason: 'order id already fulfilled' })),
    Match.when(
      false,
      () => new Forbidden({ resource: request.orderId, reason: 'reservation is owned by another caller' }),
    ),
    Match.exhaustive,
  )

/**
 * The read runs inside the store's unit of work, so the account, the lots, and the existing
 * reservation are the values the whole decision commits against.
 */
const loadIn = (unit: SettlementUnit.SettlementUnit) => (request: PlaceOrderRequest) =>
  Effect.gen(function*() {
    const snapshot = yield* SettlementUnit.load(unit, {
      orderId: request.orderId,
      customerId: request.customerId,
      skus: skusOf(request),
    })
    yield* Option.match(snapshot.reservedBy, {
      onNone: () => Effect.void,
      onSome: (owner) => Effect.fail(reservationRefusal(owner, request)),
    })
    const now = yield* DateTime.now
    return yield* Effect.orDie(
      S.encodeEffect(PlaceOrderCommand)(
        new PlaceOrderCommand({
          orderId: request.orderId,
          lines: request.lines,
          kits: request.kits,
          tier: snapshot.tier,
          account: snapshot.account,
          stock: snapshot.stock,
          now,
        }),
      ),
    )
  })

const allocationsOf = (decision: FulfillmentDecision): readonly LotAllocation[] =>
  Match.value(decision).pipe(
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', 'Backordered', ({ allocations }) => allocations),
    Match.tag('CreditHold', (): readonly LotAllocation[] => []),
    Match.exhaustive,
  )

const backorderedLinesOf = (decision: FulfillmentDecision): Option.Option<readonly OrderLine[]> =>
  Match.value(decision).pipe(
    Match.tag('Backordered', ({ backorderedLines }) => Option.some(backorderedLines)),
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', 'CreditHold', () => Option.none<readonly OrderLine[]>()),
    Match.exhaustive,
  )

const stockReservedOf = (decision: FulfillmentDecision, now: DateTime.Utc): Option.Option<StockReserved> => {
  const allocations = allocationsOf(decision)
  return Match.value(allocations.length === 0).pipe(
    Match.when(true, () => Option.none<StockReserved>()),
    Match.when(
      false,
      () => Option.some(StockReserved.make({ orderId: decision.orderId, allocations, occurredAt: now })),
    ),
    Match.exhaustive,
  )
}

const backorderRecordedOf = (decision: FulfillmentDecision, now: DateTime.Utc): Option.Option<BackorderRecorded> =>
  Option.map(
    backorderedLinesOf(decision),
    (lines) => BackorderRecorded.make({ orderId: decision.orderId, backorderedLines: lines, occurredAt: now }),
  )

const reservationEventsOf = (
  decision: FulfillmentDecision,
  now: DateTime.Utc,
): readonly InventoryReservationEvents[] =>
  Arr.getSomes([stockReservedOf(decision, now), backorderRecordedOf(decision, now)])

const chargedAmountOf = (decision: FulfillmentDecision): Option.Option<Money> =>
  Match.value(decision).pipe(
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', ({ allocations }) =>
      Option.some(moneyOf(Arr.reduce(allocations, 0, (total, allocation) =>
        total + allocation.quantity)))),
    Match.tag('Backordered', 'CreditHold', () =>
      Option.none<Money>()),
    Match.exhaustive,
  )

const planOf = (decision: FulfillmentDecision, read: PlaceOrderRead): OrderPlan => {
  const now = DateTime.makeUnsafe(read.now)
  const customerId = read.account.customerId
  return {
    orderId: decision.orderId,
    customerId,
    charge: chargedAmountOf(decision),
    events: reservationEventsOf(decision, now),
    audit: AuditPayload.make({
      orderId: decision.orderId,
      actorId: customerId,
      decisionTag: decision._tag,
      occurredAt: now,
    }),
  }
}

/** The charge span records a charge that committed, so it is started only after the settle returned. */
const recordCharge = (plan: OrderPlan): Effect.Effect<void> =>
  Option.match(plan.charge, {
    onNone: () => Effect.void,
    onSome: (amount) =>
      Span.start(CreditCharge, { 'app.charge.amount': amount, 'app.customer.id': plan.customerId })(Effect.void),
  })

/** Every settle decision is written the same way: committed in the unit that loaded it, then charged. */
const commitIn = (unit: SettlementUnit.SettlementUnit) => (decision: SettleDecisionEncoded, read: PlaceOrderRead) =>
  Effect.gen(function*() {
    const wire = yield* wireDecisionOf(decision)
    const plan = planOf(wire, read)
    yield* SettlementUnit.settle(unit, plan).pipe(
      Span.start(ReservationCommit, {
        'app.customer.id': plan.customerId,
        'app.order.id': plan.orderId,
        'app.reservation.event.count': plan.events.length,
      }),
    )
    yield* recordCharge(plan)
    return wire
  })

/**
 * The whole use case over one open unit: load, decide, settle. Only the store's `unitOfWork`
 * hands out a unit, so the cell cannot run outside one, and it settles in the unit it read from.
 */
export const placeOrderCell = (unit: SettlementUnit.SettlementUnit) => {
  const read = loadIn(unit)
  return Sandwich.named(PlaceOrder.name)(read)
    .decide(placeOrder)
    .write({
      OrderAllocated: commitIn(unit),
      OrderAllocatedWithOverdraft: commitIn(unit),
      OrderBackordered: commitIn(unit),
      OrderHeld: commitIn(unit),
      InsufficientStock: refuse,
      CreditLimitExceeded: refuse,
      CommandRejected: rejectedRead,
    })
}
