import { Effect, Match, Option, Schema as S } from 'effect'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import {
  CreditAccountNotFound,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  FulfillmentDecision,
  type FulfillmentDecision as FulfillmentDecisionType,
  InsufficientStock,
  StoreUnavailable,
} from '../fulfillment/decision.schema.js'
import { placeOrderCell } from '../fulfillment/place-order.cell.js'
import { InventoryStore } from '../inventory/InventoryStore.service.js'
import { AuthContext } from '../ports/AuthContext.service.js'
import { ReservationLog, type ReservationRecord } from '../ports/ReservationLog.service.js'
import { SettlementStore } from '../ports/SettlementStore.service.js'
import { AuthMiddleware } from './AuthMiddleware.service.js'
import {
  GetReservationRequest,
  ListStockRequest,
  ReservationView,
  StockView,
  SubmitOrderRequest,
} from './inventory-fulfillment.schema.js'

/**
 * Submit a fulfillment order. The use case runs inside the settlement store's unit of work,
 * which re-runs the whole cell on a serialization failure; the edge keeps no retry of its own.
 * `Unauthorized` joins the failure union from {@link AuthMiddleware}.
 */
export const SubmitOrder = Rpc.make('submitOrder', {
  payload: SubmitOrderRequest,
  success: FulfillmentDecision,
  error: S.Union([
    InsufficientStock,
    CreditLimitExceeded,
    DuplicateOrder,
    Forbidden,
    CreditAccountNotFound,
    StoreUnavailable,
  ]),
}).middleware(AuthMiddleware)

export const GetReservation = Rpc.make('getReservation', {
  payload: GetReservationRequest,
  success: ReservationView,
  error: S.Union([Forbidden, StoreUnavailable]),
}).middleware(AuthMiddleware)

export const ListStock = Rpc.make('listStock', {
  payload: ListStockRequest,
  success: StockView,
  error: StoreUnavailable,
}).middleware(AuthMiddleware)

export const FulfillmentRpcs = RpcGroup.make(SubmitOrder, GetReservation, ListStock)

const submitOrderOutcome = (
  outcome: FulfillmentDecisionType | InsufficientStock | CreditLimitExceeded,
): Effect.Effect<FulfillmentDecisionType, InsufficientStock | CreditLimitExceeded> =>
  Match.value(outcome).pipe(
    Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', 'Backordered', 'CreditHold', (decision) =>
      Effect.succeed(decision)),
    Match.tag('InsufficientStock', 'CreditLimitExceeded', (error) =>
      Effect.fail(error)),
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

const submitOrder = (request: SubmitOrderRequest) =>
  Effect.gen(function*() {
    const { userId } = yield* AuthContext
    const store = yield* SettlementStore
    const outcome = yield* store.unitOfWork((unit) =>
      placeOrderCell(unit).run({
        orderId: request.orderId,
        customerId: userId,
        lines: request.lines,
        kits: request.kits,
      })
    )
    return yield* submitOrderOutcome(outcome)
  })

const ownedReservation = (record: ReservationRecord, userId: string): Effect.Effect<ReservationView, Forbidden> =>
  ownershipOf(
    record,
    userId,
    Effect.succeed(
      ReservationView.make({
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

const listStock = (request: ListStockRequest) =>
  Effect.gen(function*() {
    const store = yield* InventoryStore
    const page = yield* store.readStockPage({
      cursor: Option.fromUndefinedOr(request.cursor),
      limit: request.limit ?? defaultStockPageSize,
      warehouseId: Option.fromUndefinedOr(request.warehouseId),
    })
    return StockView.make({ partitions: page.partitions, nextCursor: Option.getOrNull(page.nextCursor) })
  })

export const handlers = FulfillmentRpcs.toLayer({
  submitOrder,
  getReservation,
  listStock,
})
