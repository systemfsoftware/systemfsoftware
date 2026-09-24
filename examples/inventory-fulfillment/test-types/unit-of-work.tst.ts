import { Effect, pipe } from 'effect'
import type { Pipeable } from 'effect/Pipeable'
import { describe, expect, it } from 'tstyche'
import type {
  CreditAccountNotFound,
  DuplicateOrder,
  Forbidden,
  FulfillmentDecision,
  FulfillmentRefusal,
  StoreUnavailable,
} from '../src/fulfillment/decision.schema.js'
import { placeOrderCell, type PlaceOrderRequest } from '../src/fulfillment/place-order.cell.js'
import {
  load,
  type OrderKey,
  type OrderPlan,
  type OrderSnapshot,
  settle,
  type SettlementFailure,
  type SettlementUnit,
  type TypeId,
} from '../src/ports/settlement-unit.handle.js'
import type { SettlementStoreService } from '../src/ports/SettlementStore.service.js'

declare const request: PlaceOrderRequest
declare const store: SettlementStoreService
declare const unit: SettlementUnit
declare const key: OrderKey
declare const plan: OrderPlan
declare const forged: Pipeable & { readonly [K in TypeId]: TypeId }

type PlaceOrderOutcome = Effect.Effect<
  FulfillmentDecision | FulfillmentRefusal,
  CreditAccountNotFound | DuplicateOrder | Forbidden | StoreUnavailable,
  never
>

describe('SettlementStore.unitOfWork', () => {
  it('Should_RunTheCellOverTheUnitItHandsOut_When_NoServiceIsNeeded', () => {
    expect(store.unitOfWork((opened) => placeOrderCell(opened).run(request))).type.toBe<PlaceOrderOutcome>()
  })

  it('Should_HandItsCallbackTheOpenUnit_When_UnitOfWorkRuns', () => {
    expect(store.unitOfWork((opened) => {
      expect(opened).type.toBe<SettlementUnit>()
      return Effect.void
    })).type.toBe<Effect.Effect<void, StoreUnavailable, never>>()
  })

  it('Should_TakeAFunctionOfTheUnit_When_AnEffectBuiltOutsideItIsPassed', () => {
    expect(store.unitOfWork).type.toBeCallableWith((opened: SettlementUnit) => placeOrderCell(opened).run(request))
    expect(store.unitOfWork).type.not.toBeCallableWith(placeOrderCell(unit).run(request))
  })
})

describe('placeOrderCell', () => {
  it('Should_ExistOnlyOverAUnit_When_CalledWithAUnit', () => {
    expect(placeOrderCell).type.toBeCallableWith(unit)
    expect(placeOrderCell).type.not.toBeCallableWith(forged)
  })
})

describe('SettlementUnit.load', () => {
  it('Should_ReadThroughAUnit_When_CalledInBothDualForms', () => {
    expect(load(unit, key)).type.toBe<Effect.Effect<OrderSnapshot, SettlementFailure, never>>()
    expect(pipe(unit, load(key))).type.toBe<Effect.Effect<OrderSnapshot, SettlementFailure, never>>()
  })

  it('Should_RefuseARecordCarryingTheBrand_When_ItDidNotComeFromAUnit', () => {
    expect(load).type.toBeCallableWith(unit, key)
    expect(load).type.not.toBeCallableWith(forged, key)
  })
})

describe('SettlementUnit.settle', () => {
  it('Should_WriteThroughAUnit_When_CalledInBothDualForms', () => {
    expect(settle(unit, plan)).type.toBe<Effect.Effect<void, StoreUnavailable, never>>()
    expect(pipe(unit, settle(plan))).type.toBe<Effect.Effect<void, StoreUnavailable, never>>()
  })

  it('Should_RefuseARecordCarryingTheBrand_When_ItDidNotComeFromAUnit', () => {
    expect(settle).type.toBeCallableWith(unit, plan)
    expect(settle).type.not.toBeCallableWith(forged, plan)
  })
})
