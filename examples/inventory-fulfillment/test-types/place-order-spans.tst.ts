import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import { CreditCharge, PlaceOrder, ReservationCommit } from '../src/fulfillment/FulfillmentTaxonomy.js'
import { PlaceOrderCommand } from '../src/fulfillment/place-order.workflow.js'

const placeWith = (orderId: string, tier: 'VIP' | 'Standard') =>
  Span.start(PlaceOrder, { 'app.order.id': orderId, 'app.credit.tier': tier })

describe('Span.start(PlaceOrder)', () => {
  it('declares the span the sandwich is named by, with the command map as its attributes', () => {
    expect(PlaceOrder.name).type.toBe<'inventory.fulfillment.place'>()
    expect<Span.AttrsOf<typeof PlaceOrder>>().type.toBe<Workflow.SpanAttributes<typeof PlaceOrderCommand>>()
  })

  it('start takes the full declared attribute record', () => {
    expect(Span.start).type.toBeCallableWith(PlaceOrder, { 'app.order.id': 'order-1', 'app.credit.tier': 'Standard' })
  })

  it('start refuses a record missing a declared attribute', () => {
    expect(Span.start).type.not.toBeCallableWith(PlaceOrder, { 'app.order.id': 'order-1' })
  })

  it('start refuses a record mistyping a declared attribute', () => {
    expect(placeWith('order-1', 'Standard')).type.toBeCallableWith(Effect.succeed(7))
    expect(Span.start).type.not.toBeCallableWith(PlaceOrder, { 'app.order.id': 'order-1', 'app.credit.tier': 7 })
  })

  it('start preserves the wrapped outcome and its channels', () => {
    expect(Effect.succeed(7).pipe(placeWith('order-1', 'VIP'))).type.toBe<Effect.Effect<number, never, never>>()
    expect(Effect.fail('boom').pipe(placeWith('order-1', 'VIP'))).type.toBe<Effect.Effect<never, string, never>>()
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
