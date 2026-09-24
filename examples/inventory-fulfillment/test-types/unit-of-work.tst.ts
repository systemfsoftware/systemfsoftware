import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import {
  CreditAccountNotFound,
  DuplicateOrder,
  Forbidden,
  type FulfillmentDecision,
  type FulfillmentRefusal,
  StoreUnavailable,
} from '../src/fulfillment/decision.schema.js'
import { placeOrderCell, type PlaceOrderRequest } from '../src/fulfillment/place-order.cell.js'
import {
  type OrderKey,
  type OrderPlan,
  type OrderSnapshot,
  type SettlementFailure,
  SettlementStore,
  type SettlementStoreService,
  UnitOfWork,
} from '../src/ports/SettlementStore.service.js'

declare const request: PlaceOrderRequest
declare const store: SettlementStoreService
declare const key: OrderKey
declare const plan: OrderPlan

describe('SettlementStore.unitOfWork', () => {
  it('removes UnitOfWork from what the cell needs, keeping the store', () => {
    expect(store.unitOfWork(placeOrderCell.run(request))).type.toBe<
      Effect.Effect<
        FulfillmentDecision | FulfillmentRefusal,
        CreditAccountNotFound | DuplicateOrder | Forbidden | StoreUnavailable,
        SettlementStore
      >
    >()
  })

  it('still takes the open cell, and refuses it once the unit is hand-provided', () => {
    expect(store.unitOfWork).type.toBeCallableWith(placeOrderCell.run(request))
    expect(Effect.provideService).type.toBeCallableWith(placeOrderCell.run(request), UnitOfWork, { open: true })
  })

  it('names UnitOfWork as the service a bare cell run still needs', () => {
    expect(placeOrderCell.run(request)).type.toBe<
      Effect.Effect<
        FulfillmentDecision | FulfillmentRefusal,
        CreditAccountNotFound | DuplicateOrder | Forbidden | StoreUnavailable,
        SettlementStore | UnitOfWork
      >
    >()
    expect(placeOrderCell.run(request).pipe(Effect.provideService(UnitOfWork, { open: true }))).type.toBe<
      Effect.Effect<
        FulfillmentDecision | FulfillmentRefusal,
        CreditAccountNotFound | DuplicateOrder | Forbidden | StoreUnavailable,
        SettlementStore
      >
    >()
    expect(Effect.provideService(UnitOfWork, { open: true })).type.toBeCallableWith(placeOrderCell.run(request))
    expect(store.unitOfWork).type.not.toBeCallableWith(placeOrderCell)
  })
})
describe('SettlementStore.load', () => {
  it('names UnitOfWork in its requirement, so a bare load cannot run', () => {
    expect(store.load(key)).type.toBe<Effect.Effect<OrderSnapshot, SettlementFailure, UnitOfWork>>()
  })
})

describe('SettlementStore.settle', () => {
  it('names UnitOfWork in its requirement, so a bare settle cannot run', () => {
    expect(store.settle(plan)).type.toBe<Effect.Effect<void, StoreUnavailable, UnitOfWork>>()
  })
  it('cannot hand a loaded snapshot to a settle in another unit', () => {
    const split = store.unitOfWork(store.load(key))
    expect(store.settle(plan)).type.toBe<Effect.Effect<void, StoreUnavailable, UnitOfWork>>()
    expect(split).type.toBe<Effect.Effect<OrderSnapshot, SettlementFailure, never>>()
  })
})
