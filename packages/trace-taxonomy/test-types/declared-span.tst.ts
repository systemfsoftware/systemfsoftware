import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'
import { PlaceOrder, PlaceOrderAttrs } from '../tests/__fixtures__/declared-span.schema.js'

describe('Span.start', () => {
  it('data-last start takes the full declared attribute record and the effect', () => {
    expect(Span.start(PlaceOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 })).type.toBeCallableWith(
      Effect.succeed(7),
    )
  })

  it('data-first start carries the same dual signature and pins every channel', () => {
    expect(Span.start).type.toBeCallableWith(
      Effect.succeed(7),
      PlaceOrder,
      { 'app.user.id': 'u', 'app.order.items.count': 1 },
    )
    expect(
      Span.start(Effect.succeed(7), PlaceOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 }),
    ).type.toBe<Effect.Effect<number, never, never>>()
  })

  it('data-last start preserves the wrapped outcome and pins every channel', () => {
    expect(
      Effect.succeed(7).pipe(Span.start(PlaceOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 })),
    ).type.toBe<Effect.Effect<number, never, never>>()
    expect(
      Effect.fail('boom').pipe(Span.start(PlaceOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 })),
    ).type.toBe<Effect.Effect<never, string, never>>()
  })

  it('start refuses a record missing a declared attribute, next to its positive control', () => {
    expect(Span.start).type.toBeCallableWith(
      Effect.succeed(7),
      PlaceOrder,
      { 'app.user.id': 'u', 'app.order.items.count': 1 },
    )
    expect(Span.start).type.not.toBeCallableWith(Effect.succeed(7), PlaceOrder, { 'app.user.id': 'u' })
  })

  it('start refuses a record mistyping a declared attribute', () => {
    expect(Span.start).type.not.toBeCallableWith(
      Effect.succeed(7),
      PlaceOrder,
      { 'app.user.id': 'u', 'app.order.items.count': 'many' },
    )
  })

  it('start refuses an empty record when attributes are declared', () => {
    expect(Span.start).type.not.toBeCallableWith(Effect.succeed(7), PlaceOrder, {})
  })

  it('AttrsOf reads the declared attribute type back', () => {
    expect<Span.AttrsOf<typeof PlaceOrder>>().type.toBe<S.Schema.Type<typeof PlaceOrderAttrs>>()
  })

  it('a specific declaration is assignable to the identity face a taxonomy cites', () => {
    expect(PlaceOrder).type.toBeAssignableTo<Span.Span>()
  })

  it('declare keeps the span name a literal, not a widened string', () => {
    expect(PlaceOrder.name).type.toBe<'checkout.place_order'>()
  })
})
