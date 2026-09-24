import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import { CreditCharge, PlaceOrder, ReservationCommit } from '../src/fulfillment/FulfillmentTaxonomy.js'
import { PlaceOrderCommand } from '../src/fulfillment/place-order.workflow.js'

const placeWith = (orderId: string, tier: 'VIP' | 'Standard') =>
  Span.start(PlaceOrder, { 'app.order.id': orderId, 'app.credit.tier': tier })

describe('Span.start(PlaceOrder)', () => {
  it('Should_DeclareTheSpanTheSandwichIsNamedBy_When_TheCommandMapIsItsAttributes', () => {
    expect(PlaceOrder.name).type.toBe<'inventory.fulfillment.place'>()
    expect<Span.AttrsOf<typeof PlaceOrder>>().type.toBe<Workflow.SpanAttributes<typeof PlaceOrderCommand>>()
  })

  it('Should_TakeTheFullDeclaredAttributeRecord_When_StartIsCalled', () => {
    expect(Span.start).type.toBeCallableWith(PlaceOrder, { 'app.order.id': 'order-1', 'app.credit.tier': 'Standard' })
  })

  it('Should_RefuseARecordMissingADeclaredAttribute_When_StartIsCalled', () => {
    expect(Span.start).type.not.toBeCallableWith(PlaceOrder, { 'app.order.id': 'order-1' })
  })

  it('Should_RefuseARecordMistypingADeclaredAttribute_When_StartIsCalled', () => {
    expect(placeWith('order-1', 'Standard')).type.toBeCallableWith(Effect.succeed(7))
    expect(Span.start).type.not.toBeCallableWith(PlaceOrder, { 'app.order.id': 'order-1', 'app.credit.tier': 7 })
  })

  it('Should_PreserveTheWrappedOutcomeAndItsChannels_When_StartIsPiped', () => {
    expect(Effect.succeed(7).pipe(placeWith('order-1', 'VIP'))).type.toBe<Effect.Effect<number, never, never>>()
    expect(Effect.fail('boom').pipe(placeWith('order-1', 'VIP'))).type.toBe<Effect.Effect<never, string, never>>()
  })
})

describe('Span.start(ReservationCommit)', () => {
  it('Should_TakeTheFullRecordAndRefuseOneMissingAKey_When_ReservationCommitStarts', () => {
    expect(Span.start).type.toBeCallableWith(ReservationCommit, {
      'app.customer.id': 'customer-1',
      'app.order.id': 'order-1',
      'app.reservation.event.count': 1,
    })
    expect(Span.start).type.not.toBeCallableWith(ReservationCommit, {
      'app.customer.id': 'customer-1',
      'app.order.id': 'order-1',
    })
  })
})

describe('Span.start(CreditCharge)', () => {
  it('Should_TakeTheFullRecordAndRefuseOneMissingAKey_When_CreditChargeStarts', () => {
    expect(Span.start).type.toBeCallableWith(CreditCharge, {
      'app.charge.amount': 42,
      'app.customer.id': 'customer-1',
    })
    expect(Span.start).type.not.toBeCallableWith(CreditCharge, {
      'app.customer.id': 'customer-1',
    })
  })
})
