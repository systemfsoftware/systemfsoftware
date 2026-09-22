import type { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'
import { PlaceOrder, PlaceOrderAttrs } from '../tests/__fixtures__/declared-span.schema.js'

describe('Span.declare', () => {
  it('start accepts the full declared attribute record', () => {
    expect(PlaceOrder.start).type.toBeCallableWith({ 'app.user.id': 'u', 'app.order.items.count': 1 })
  })

  it('start refuses a record missing a declared attribute', () => {
    expect(PlaceOrder.start).type.not.toBeCallableWith({ 'app.user.id': 'u' })
  })

  it('start refuses a record mistyping a declared attribute', () => {
    expect(PlaceOrder.start).type.not.toBeCallableWith({ 'app.user.id': 'u', 'app.order.items.count': 'many' })
  })

  it('start refuses an empty record when attributes are declared', () => {
    expect(PlaceOrder.start).type.not.toBeCallableWith({})
  })

  it('start preserves the wrapped outcome and its channels', () => {
    const value = 7
    const wrapped = PlaceOrder.start({ 'app.user.id': 'u', 'app.order.items.count': 1 })(Effect.succeed(value))
    expect(wrapped).type.toBe<Effect.Effect<number, never, never>>()
  })

  it('AttrsOf reads the declared attribute type back', () => {
    expect<Span.AttrsOf<typeof PlaceOrder>>().type.toBe<S.Schema.Type<typeof PlaceOrderAttrs>>()
  })
})
