import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import { CreditCharge, FulfillmentSettle, ReservationCommit } from '../src/fulfillment/FulfillmentTaxonomy.js'
import { SettleFulfillmentCommand } from '../src/fulfillment/settle-fulfillment.workflow.js'

const settleWith = (orderId: string) => Span.start(FulfillmentSettle, { 'app.order.id': orderId })

describe('Span.start(FulfillmentSettle)', () => {
  it('Should_DeclareTheSpanTheSandwichIsNamedBy_When_TheCommandMapIsItsAttributes', () => {
    expect(FulfillmentSettle.name).type.toBe<'inventory.fulfillment.settle'>()
    expect<Span.AttrsOf<typeof FulfillmentSettle>>().type.toBe<
      Workflow.SpanAttributes<typeof SettleFulfillmentCommand>
    >()
  })

  it('Should_TakeTheFullDeclaredAttributeRecord_When_StartIsCalled', () => {
    expect(Span.start).type.toBeCallableWith(FulfillmentSettle, { 'app.order.id': 'order-1' })
  })

  it('Should_RefuseARecordMissingADeclaredAttribute_When_StartIsCalled', () => {
    expect(Span.start).type.not.toBeCallableWith(FulfillmentSettle, {})
  })

  it('Should_RefuseARecordMistypingADeclaredAttribute_When_StartIsCalled', () => {
    expect(settleWith('order-1')).type.toBeCallableWith(Effect.succeed(7))
    expect(Span.start).type.not.toBeCallableWith(FulfillmentSettle, { 'app.order.id': 7 })
  })

  it('Should_PreserveTheWrappedOutcomeAndItsChannels_When_StartIsPiped', () => {
    expect(Effect.succeed(7).pipe(settleWith('order-1'))).type.toBe<Effect.Effect<number, never, never>>()
    expect(Effect.fail('boom').pipe(settleWith('order-1'))).type.toBe<Effect.Effect<never, string, never>>()
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
