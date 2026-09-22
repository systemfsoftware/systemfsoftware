import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import { CreditCharge, FulfillmentSettle, ReservationCommit } from '../src/fulfillment/fulfillment-settle.span.js'

const settleWith = (orderId: string) =>
  FulfillmentSettle.start({
    'app.customer.id': 'customer-1',
    'app.fraud.risk.score': 12,
    'app.kit.count': 1,
    'app.order.id': orderId,
    'app.order.line.count': 2,
  })

describe('FulfillmentSettle.start', () => {
  it('start takes the full declared attribute record', () => {
    expect(FulfillmentSettle.start).type.toBeCallableWith({
      'app.customer.id': 'customer-1',
      'app.fraud.risk.score': 12,
      'app.kit.count': 1,
      'app.order.id': 'order-1',
      'app.order.line.count': 2,
    })
  })

  it('start refuses a record missing a declared attribute', () => {
    expect(FulfillmentSettle.start).type.not.toBeCallableWith({
      'app.customer.id': 'customer-1',
      'app.fraud.risk.score': 12,
      'app.kit.count': 1,
      'app.order.id': 'order-1',
    })
  })

  it('start refuses a record mistyping a declared attribute', () => {
    expect(settleWith('order-1')).type.toBeCallableWith(Effect.succeed(7))
    expect(FulfillmentSettle.start).type.not.toBeCallableWith({
      'app.customer.id': 'customer-1',
      'app.fraud.risk.score': 12,
      'app.kit.count': 1,
      'app.order.id': 7,
      'app.order.line.count': 2,
    })
  })

  it('start preserves the wrapped outcome and its channels', () => {
    expect(settleWith('order-1')(Effect.succeed(7))).type.toBe<Effect.Effect<number, never, never>>()
    expect(settleWith('order-1')(Effect.fail('boom'))).type.toBe<Effect.Effect<never, string, never>>()
  })
})

describe('ReservationCommit.start', () => {
  it('start takes the full declared attribute record and refuses one missing a key', () => {
    expect(ReservationCommit.start).type.toBeCallableWith({
      'app.customer.id': 'customer-1',
      'app.order.id': 'order-1',
      'app.reservation.event.count': 1,
    })
    expect(ReservationCommit.start).type.not.toBeCallableWith({
      'app.customer.id': 'customer-1',
      'app.order.id': 'order-1',
    })
  })
})

describe('CreditCharge.start', () => {
  it('start takes the full declared attribute record and refuses one missing a key', () => {
    expect(CreditCharge.start).type.toBeCallableWith({
      'app.charge.amount': 42,
      'app.customer.id': 'customer-1',
    })
    expect(CreditCharge.start).type.not.toBeCallableWith({
      'app.customer.id': 'customer-1',
    })
  })
})
