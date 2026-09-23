import { DateTime, Effect, Match, Option, Predicate, Schedule, Schema as S } from 'effect'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import {
  ConflictRollback,
  CreditAccountNotFound,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  FulfillmentDecision,
  type FulfillmentDecision as FulfillmentDecisionType,
  InsufficientStock,
} from '../fulfillment/decision.schema.js'
import { AuditPayload } from '../fulfillment/event.schema.js'
import { fulfillmentCell } from '../fulfillment/fulfillment.cell.js'
import { FulfillmentConfig } from '../fulfillment/FulfillmentConfig.js'
import { Order } from '../fulfillment/order.schema.js'
import { InventoryStore } from '../inventory/InventoryStore.js'
import { AuthContext } from '../ports/AuthContext.js'
import { ReservationLog, type ReservationRecord } from '../ports/ReservationLog.js'
import { AuthMiddleware } from './auth.middleware.js'
import {
  GetReservationRequest,
  ListStockRequest,
  ReservationView,
  StockView,
  SubmitOrderRequest,
} from './inventory-fulfillment.schema.js'

/**
 * Submit a fulfillment order. `ConflictRollback` rides the success union (a
 * wire decision, not an error); `Unauthorized` joins the failure union from
 * {@link AuthMiddleware}.
 */
export const SubmitOrder = Rpc.make('submitOrder', {
  payload: SubmitOrderRequest,
  success: FulfillmentDecision,
  error: S.Union([InsufficientStock, CreditLimitExceeded, DuplicateOrder, Forbidden, CreditAccountNotFound]),
}).middleware(AuthMiddleware)

export const GetReservation = Rpc.make('getReservation', {
  payload: GetReservationRequest,
  success: ReservationView,
  error: Forbidden,
}).middleware(AuthMiddleware)

export const ListStock = Rpc.make('listStock', {
  payload: ListStockRequest,
  success: StockView,
}).middleware(AuthMiddleware)

export const FulfillmentRpcs = RpcGroup.make(SubmitOrder, GetReservation, ListStock)

const submitOrderOutcome = (
  outcome: FulfillmentDecisionType | InsufficientStock | CreditLimitExceeded,
): Effect.Effect<FulfillmentDecisionType, InsufficientStock | CreditLimitExceeded> =>
  Match.value(outcome).pipe(
    Match.tag('AllocatedSplit', (decision) => Effect.succeed(decision)),
    Match.tag('AllocatedWithOverdraft', (decision) => Effect.succeed(decision)),
    Match.tag('Backordered', (decision) => Effect.succeed(decision)),
    Match.tag('CreditHold', (decision) => Effect.succeed(decision)),
    Match.tag('ConflictRollback', (decision) => Effect.succeed(decision)),
    Match.tag('InsufficientStock', (error) => Effect.fail(error)),
    Match.tag('CreditLimitExceeded', (error) => Effect.fail(error)),
    Match.exhaustive,
  )

const forbidden = (resource: string, reason: string): Forbidden => new Forbidden({ resource, reason })

const ownershipOf = <A, E>(
  record: ReservationRecord,
  userId: string,
  onOwner: Effect.Effect<A, E>,
): Effect.Effect<A, E | Forbidden> =>
  Match.value(record.customerId === userId).pipe(
    Match.when(true, () => onOwner),
    Match.when(false, () => Effect.fail(forbidden(record.orderId, 'reservation is owned by another caller'))),
    Match.exhaustive,
  )

const rollback = (orderId: string, customerId: string, attempts: number) =>
  Effect.gen(function*() {
    const log = yield* ReservationLog
    const now = yield* DateTime.now
    yield* log.appendRollback(
      new AuditPayload({
        orderId,
        actorId: customerId,
        decisionTag: 'ConflictRollback',
        occurredAt: now,
      }),
    )
    return new ConflictRollback({ orderId, attempts })
  })

const runFulfillment = (request: {
  readonly order: Order
  readonly kits: SubmitOrderRequest['kits']
  readonly fraudRisk: SubmitOrderRequest['fraudRisk']
}) =>
  Effect.gen(function*() {
    const config = yield* FulfillmentConfig
    return yield* fulfillmentCell.run(request).pipe(
      Effect.retry({
        times: config.maxRetries - 1,
        schedule: Schedule.spaced(config.retryInterval).pipe(Schedule.jittered),
        while: Predicate.isTagged('OptimisticConflict'),
      }),
      Effect.catchTag('OptimisticConflict', () =>
        rollback(request.order.orderId, request.order.customerId, config.maxRetries)),
    )
  })

const submitOrder = (request: SubmitOrderRequest) =>
  Effect.gen(function*() {
    const { userId } = yield* AuthContext
    const log = yield* ReservationLog
    const existing = yield* log.findReservation(request.orderId)
    yield* Option.match(existing, {
      onNone: () => Effect.void,
      onSome: (record) =>
        ownershipOf(
          record,
          userId,
          Effect.fail(new DuplicateOrder({ orderId: request.orderId, reason: 'order id already fulfilled' })),
        ),
    })
    const outcome = yield* runFulfillment({
      order: new Order({ orderId: request.orderId, customerId: userId, lines: request.lines }),
      kits: request.kits,
      fraudRisk: request.fraudRisk,
    })
    return yield* submitOrderOutcome(outcome)
  })

const ownedReservation = (record: ReservationRecord, userId: string): Effect.Effect<ReservationView, Forbidden> =>
  ownershipOf(
    record,
    userId,
    Effect.succeed(
      new ReservationView({
        orderId: record.orderId,
        customerId: record.customerId,
        allocations: record.allocations,
        occurredAt: record.occurredAt,
      }),
    ),
  )

const getReservation = (request: GetReservationRequest) =>
  Effect.gen(function*() {
    const { userId } = yield* AuthContext
    const log = yield* ReservationLog
    const found = yield* log.findReservation(request.orderId)
    return yield* Option.match(found, {
      onNone: () => Effect.fail(forbidden(request.orderId, 'reservation not found')),
      onSome: (record) => ownedReservation(record, userId),
    })
  })

const defaultStockPageSize = 50
const maxStockPageSize = 100

const pageSizeOf = (limit: number | undefined): number =>
  Math.max(1, Math.min(limit ?? defaultStockPageSize, maxStockPageSize))

const listStock = (request: ListStockRequest) =>
  Effect.gen(function*() {
    const store = yield* InventoryStore
    const page = yield* store.readStockPage({
      cursor: Option.fromUndefinedOr(request.cursor),
      limit: pageSizeOf(request.limit),
      warehouseId: Option.fromUndefinedOr(request.warehouseId),
    })
    return new StockView({ partitions: page.partitions, nextCursor: Option.getOrNull(page.nextCursor) })
  })

export const handlers = FulfillmentRpcs.toLayer({
  submitOrder,
  getReservation,
  listStock,
})
