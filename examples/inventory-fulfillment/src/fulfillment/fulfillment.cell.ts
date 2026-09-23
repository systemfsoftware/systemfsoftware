import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Array as Arr, DateTime, Effect, Match, Option, Result, Schema as S } from 'effect'
import { allocateStock, type AllocateStockCommand } from '../inventory/allocate-stock.workflow.js'
import { type KitDefinition, type LotAllocation, type WarehouseStockPartition } from '../inventory/inventory.schema.js'
import {
  type CreditProof,
  type SettlementCharge,
  type SettlementCommand,
  SettlementStore,
  type StockProof,
} from '../ports/SettlementStore.js'
import { checkCredit, type CreditCheckCommand } from './check-credit.workflow.js'
import { type CreditAccount, type CustomerTier, type FraudRiskScore, Money } from './credit.schema.js'
import {
  CoreFulfillmentDecision,
  type CreditAccountNotFound,
  FulfillmentRefusal,
  OptimisticConflict,
} from './decision.schema.js'
import { AuditPayload, BackorderRecorded, type InventoryReservationEvents, StockReserved } from './event.schema.js'
import { type ComponentDemand, explodeBundle, type ExplodeBundleCommand } from './explode-bundle.workflow.js'
import { CreditCharge, FulfillmentSettle, ReservationCommit as ReservationCommitSpan } from './FulfillmentTaxonomy.js'
import type { Order, OrderLine } from './order.schema.js'
import {
  settleFulfillment,
  SettleFulfillmentCommand,
  SettleFulfillmentDecision,
  SettleFulfillmentError,
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
  readonly creditProof: CreditProof
  readonly stock: readonly WarehouseStockPartition[]
  readonly stockProof: StockProof
  readonly kits: readonly KitDefinition[]
  readonly now: DateTime.Utc
}

/** Who the charge and the audit event are written for, and when: what the write needs that the pure command does not. */
interface SettlementWriteContext {
  readonly customerId: string
  readonly now: DateTime.Utc
}

interface SettlementProofs {
  readonly creditProof: CreditProof
  readonly stockProof: StockProof
}

type SettleCommandEncoded = (typeof SettleFulfillmentCommand)['Encoded']

/**
 * The settlement runs as four sandwiches, one per decision: explode the bundle, check credit,
 * allocate stock, settle. The first reads the context once; each later cell's `read` takes the
 * previous cell's response, so these are the values that flow between them. Credit and
 * allocation outcomes, refusals included, travel encoded because they are the settle
 * command's data: settle decides which refusal wins.
 */
interface Exploded {
  readonly context: RawContext
  readonly components: ReadonlyArray<(typeof ComponentDemand)['Encoded']>
}

interface Credited extends Exploded {
  readonly credit: SettleCommandEncoded['credit']
}

interface Allocated extends Credited {
  readonly allocation: SettleCommandEncoded['allocation']
}

type ExplodeRead = (typeof ExplodeBundleCommand)['Encoded'] & { readonly context: RawContext }
type CreditRead = (typeof CreditCheckCommand)['Encoded'] & Exploded
type AllocateRead = (typeof AllocateStockCommand)['Encoded'] & Credited

/**
 * What the settle cell's `read` hands its handlers: the settle command in its encoded form,
 * plus the write context and the store's proofs, riding beside the command instead of inside it.
 */
type SettlementRead = SettleCommandEncoded & SettlementWriteContext & SettlementProofs
type SettleDecisionEncoded = (typeof SettleFulfillmentDecision)['Encoded']
type SettleErrorEncoded = (typeof SettleFulfillmentError)['Encoded']
type WireDecisionEncoded = (typeof CoreFulfillmentDecision)['Encoded']

const moneyOf = (value: number): Money => Result.getOrThrow(S.decodeResult(Money)(value))

const requiredAmountOf = (components: Exploded['components']): number =>
  Arr.reduce(components, 0, (total, component) => total + component.quantity)

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
 * The one place a settle outcome becomes the RPC's wire value. The handlers receive the
 * outcome encoded, and the wire contract brands its ids and money, so the outcome is renamed
 * into the wire's encoded form and decoded once. Both schemas live in this example, so a
 * decode failure is a mismatch between them, a defect rather than a refusal.
 */
const wireDecisionOf = (decision: SettleDecisionEncoded): Effect.Effect<CoreFulfillmentDecision> =>
  Effect.orDie(S.decodeEffect(CoreFulfillmentDecision)(wireEncodedOf(decision)))

/** Each settle refusal shares its tag and fields with the wire refusal the RPC answers, so it decodes as it is. */
const wireRefusalOf = (error: SettleErrorEncoded): Effect.Effect<FulfillmentRefusal> =>
  Effect.orDie(S.decodeEffect(FulfillmentRefusal)(error))

const readContext = (
  request: FulfillmentRequest,
): Effect.Effect<RawContext, CreditAccountNotFound, SettlementStore> =>
  Effect.gen(function*() {
    const store = yield* SettlementStore
    const [stock, credit, now] = yield* Effect.all(
      [store.readAllStock, store.readCredit(request.order.customerId), DateTime.now],
      { concurrency: 'unbounded' },
    ).pipe(Effect.catchTag(['SchemaError', 'EffectDrizzleQueryError'], (error) => Effect.die(error)))
    return {
      order: request.order,
      customerTier: credit.tier,
      fraudRisk: request.fraudRisk,
      credit: credit.account,
      creditProof: credit.proof,
      stock: stock.partitions,
      stockProof: stock.proof,
      kits: request.kits,
      now,
    }
  })

/** Every cell here builds its command from values it already holds, so a rejection is a defect in this module. */
const rejectedRead = (cell: string) => (rejected: Sandwich.CommandRejected): Effect.Effect<never> =>
  Effect.die(new Error(`the ${cell} command the cell read failed its own schema: ${rejected.issue}`))

const readExplode = (
  request: FulfillmentRequest,
): Effect.Effect<ExplodeRead, CreditAccountNotFound, SettlementStore> =>
  Effect.map(readContext(request), (context) => ({ lines: context.order.lines, kits: context.kits, context }))

const carryComponents = (
  exploded: { readonly components: Exploded['components'] },
  read: ExplodeRead,
): Effect.Effect<Exploded> => Effect.succeed({ context: read.context, components: exploded.components })

const explodeBundleCell = Sandwich.named('inventory.fulfillment.bundle.explode')(readExplode)
  .decide(explodeBundle)
  .write({
    BundleExploded: carryComponents,
    NothingToExplode: carryComponents,
    CommandRejected: rejectedRead('bundle explosion'),
  })

const readCredit = (exploded: Exploded): Effect.Effect<CreditRead> =>
  Effect.succeed({
    ...exploded,
    orderId: exploded.context.order.orderId,
    tier: exploded.context.customerTier,
    account: exploded.context.credit,
    requiredAmount: requiredAmountOf(exploded.components),
  })

const carryCredit = (credit: Credited['credit'], read: CreditRead): Effect.Effect<Credited> =>
  Effect.succeed({ context: read.context, components: read.components, credit })

const checkCreditCell = Sandwich.named('inventory.fulfillment.credit.check')(readCredit)
  .decide(checkCredit)
  .write({
    CreditGranted: carryCredit,
    CreditHold: carryCredit,
    CreditLimitExceeded: carryCredit,
    CommandRejected: rejectedRead('credit check'),
  })

const readAllocation = (credited: Credited): Effect.Effect<AllocateRead> =>
  Effect.succeed({
    ...credited,
    orderId: credited.context.order.orderId,
    lines: credited.components,
    stock: credited.context.stock,
    now: credited.context.now,
  })

const carryAllocation = (allocation: Allocated['allocation'], read: AllocateRead): Effect.Effect<Allocated> =>
  Effect.succeed({ context: read.context, components: read.components, credit: read.credit, allocation })

const allocateStockCell = Sandwich.named('inventory.fulfillment.stock.allocate')(readAllocation)
  .decide(allocateStock)
  .write({
    StockAllocated: carryAllocation,
    StockBackordered: carryAllocation,
    InsufficientStock: carryAllocation,
    CommandRejected: rejectedRead('stock allocation'),
  })

const readSettlement = (allocated: Allocated): Effect.Effect<SettlementRead> =>
  Effect.succeed({
    orderId: allocated.context.order.orderId,
    credit: allocated.credit,
    allocation: allocated.allocation,
    customerId: allocated.context.order.customerId,
    creditProof: allocated.context.creditProof,
    stockProof: allocated.context.stockProof,
    now: allocated.context.now,
  })

const allocationsOf = (decision: CoreFulfillmentDecision): readonly LotAllocation[] =>
  Match.value(decision).pipe(
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', 'Backordered', ({ allocations }) => allocations),
    Match.tag('CreditHold', (): readonly LotAllocation[] => []),
    Match.exhaustive,
  )

const backorderedLinesOf = (decision: CoreFulfillmentDecision): Option.Option<readonly OrderLine[]> =>
  Match.value(decision).pipe(
    Match.tag('Backordered', ({ backorderedLines }) => Option.some(backorderedLines)),
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', 'CreditHold', () => Option.none<readonly OrderLine[]>()),
    Match.exhaustive,
  )

const stockReservedOf = (decision: CoreFulfillmentDecision, now: DateTime.Utc): Option.Option<StockReserved> => {
  const allocations = allocationsOf(decision)
  return Match.value(allocations.length === 0).pipe(
    Match.when(true, () => Option.none<StockReserved>()),
    Match.when(
      false,
      () => Option.some(new StockReserved({ orderId: decision.orderId, allocations, occurredAt: now })),
    ),
    Match.exhaustive,
  )
}

const backorderRecordedOf = (decision: CoreFulfillmentDecision, now: DateTime.Utc): Option.Option<BackorderRecorded> =>
  Option.map(
    backorderedLinesOf(decision),
    (lines) => new BackorderRecorded({ orderId: decision.orderId, backorderedLines: lines, occurredAt: now }),
  )

const reservationEventsOf = (
  decision: CoreFulfillmentDecision,
  now: DateTime.Utc,
): readonly InventoryReservationEvents[] =>
  Arr.getSomes([stockReservedOf(decision, now), backorderRecordedOf(decision, now)])

const chargedAmountOf = (decision: CoreFulfillmentDecision): Option.Option<Money> =>
  Match.value(decision).pipe(
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', ({ allocations }) =>
      Option.some(moneyOf(Arr.reduce(allocations, 0, (total, allocation) =>
        total + allocation.quantity)))),
    Match.tag('Backordered', 'CreditHold', () =>
      Option.none<Money>()),
    Match.exhaustive,
  )

const settlementCommandOf = (decision: CoreFulfillmentDecision, read: SettlementRead): SettlementCommand => ({
  orderId: decision.orderId,
  customerId: read.customerId,
  events: reservationEventsOf(decision, read.now),
  audit: new AuditPayload({
    orderId: decision.orderId,
    actorId: read.customerId,
    decisionTag: decision._tag,
    occurredAt: read.now,
  }),
  stock: read.stockProof,
  charge: Option.map(chargedAmountOf(decision), (amount) => ({ amount, proof: read.creditProof })),
})

/** The charge span records a charge that committed; a conflicted settle writes nothing, so it records none. */
const recordCharge = (read: SettlementRead, charge: Option.Option<SettlementCharge>): Effect.Effect<void> =>
  Option.match(charge, {
    onNone: () => Effect.void,
    onSome: ({ amount }) =>
      Span.start(CreditCharge, { 'app.charge.amount': Number(amount), 'app.customer.id': read.customerId })(
        Effect.void,
      ),
  })

/** Every settle decision is written the same way: as its wire decision, committed and charged in one store call. */
const settle = (decision: SettleDecisionEncoded, read: SettlementRead) =>
  Effect.flatMap(wireDecisionOf(decision), (wire) => {
    const command = settlementCommandOf(wire, read)
    return Effect.flatMap(SettlementStore, (store) => store.settle(command)).pipe(
      Span.start(ReservationCommitSpan, {
        'app.customer.id': read.customerId,
        'app.order.id': wire.orderId,
        'app.reservation.event.count': command.events.length,
      }),
      Effect.flatMap((outcome) =>
        Match.value(outcome).pipe(
          Match.when('Conflict', () => Effect.fail(new OptimisticConflict({}))),
          Match.when('Committed', () => Effect.asVoid(recordCharge(read, command.charge))),
          Match.exhaustive,
        )
      ),
      Effect.as(wire),
    )
  })

const settleFulfillmentCell = Sandwich.named(FulfillmentSettle.name)(readSettlement)
  .decide(settleFulfillment)
  .write({
    OrderAllocated: settle,
    OrderAllocatedWithOverdraft: settle,
    OrderBackordered: settle,
    OrderHeld: settle,
    InsufficientStock: wireRefusalOf,
    CreditLimitExceeded: wireRefusalOf,
    CommandRejected: rejectedRead('settlement'),
  })

/**
 * The fulfillment pipeline: four sandwiches, one per decision, composed with `Cell.andThen`.
 * Callers run `fulfillmentCell.run(request)`. Conflicted orders retry at the RPC edge, which
 * runs the cell again from read on a configured, jittered schedule.
 */
export const fulfillmentCell = explodeBundleCell.pipe(
  Cell.andThen(checkCreditCell),
  Cell.andThen(allocateStockCell),
  Cell.andThen(settleFulfillmentCell),
)
