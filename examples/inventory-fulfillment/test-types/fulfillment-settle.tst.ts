import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import { CreditCharge, FulfillmentSettle, ReservationCommit } from '../src/fulfillment/fulfillment-settle.span.js'

const settleWith = (orderId: string) => Span.start(FulfillmentSettle, { orderId })

describe('Span.start(FulfillmentSettle)', () => {
  it('start takes the full declared attribute record', () => {
    expect(Span.start).type.toBeCallableWith(FulfillmentSettle, { orderId: 'order-1' })
  })

  it('start refuses a record missing a declared attribute', () => {
    expect(Span.start).type.not.toBeCallableWith(FulfillmentSettle, {})
  })

  it('start refuses a record mistyping a declared attribute', () => {
    expect(settleWith('order-1')).type.toBeCallableWith(Effect.succeed(7))
    expect(Span.start).type.not.toBeCallableWith(FulfillmentSettle, { orderId: 7 })
  })

  it('start preserves the wrapped outcome and its channels', () => {
    expect(settleWith('order-1')(Effect.succeed(7))).type.toBe<Effect.Effect<number, never, never>>()
    expect(settleWith('order-1')(Effect.fail('boom'))).type.toBe<Effect.Effect<never, string, never>>()
  })
})

describe('Span.start(ReservationCommit)', () => {
  it('start takes the full declared attribute record and refuses one missing a key', () => {
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
  it('start takes the full declared attribute record and refuses one missing a key', () => {
    expect(Span.start).type.toBeCallableWith(CreditCharge, {
      'app.charge.amount': 42,
      'app.customer.id': 'customer-1',
    })
    expect(Span.start).type.not.toBeCallableWith(CreditCharge, {
      'app.customer.id': 'customer-1',
    })
  })
})
