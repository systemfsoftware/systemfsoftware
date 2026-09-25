import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'
import type { PlaceOrder, PlaceOrderAttrs } from '../tests/__fixtures__/declared-span.fixture.js'

declare const placeOrder: typeof PlaceOrder

describe('Span.start', () => {
  it('Should_AcceptFullDeclaredRecord_When_StartIsDataLast', () => {
    expect(Span.start(placeOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 })).type.toBeCallableWith(
      Effect.succeed(7),
    )
  })

  it('Should_CarryDualSignatureAndPinChannels_When_StartIsDataFirst', () => {
    expect(Span.start).type.toBeCallableWith(
      Effect.succeed(7),
      placeOrder,
      { 'app.user.id': 'u', 'app.order.items.count': 1 },
    )
    expect(
      Span.start(Effect.succeed(7), placeOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 }),
    ).type.toBe<Effect.Effect<number, never, never>>()
  })

  it('Should_PreserveOutcomeAndPinChannels_When_StartIsPipedDataLast', () => {
    expect(
      Effect.succeed(7).pipe(Span.start(placeOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 })),
    ).type.toBe<Effect.Effect<number, never, never>>()
    expect(
      Effect.fail('boom').pipe(Span.start(placeOrder, { 'app.user.id': 'u', 'app.order.items.count': 1 })),
    ).type.toBe<Effect.Effect<never, string, never>>()
  })

  it('Should_RefuseRecord_When_DeclaredAttributeMissing', () => {
    expect(Span.start).type.toBeCallableWith(
      Effect.succeed(7),
      placeOrder,
      { 'app.user.id': 'u', 'app.order.items.count': 1 },
    )
    expect(Span.start).type.not.toBeCallableWith(Effect.succeed(7), placeOrder, { 'app.user.id': 'u' })
  })

  it('Should_RefuseRecord_When_DeclaredAttributeMistyped', () => {
    expect(Span.start).type.not.toBeCallableWith(
      Effect.succeed(7),
      placeOrder,
      { 'app.user.id': 'u', 'app.order.items.count': 'many' },
    )
  })

  it('Should_RefuseEmptyRecord_When_AttributesDeclared', () => {
    expect(Span.start).type.not.toBeCallableWith(Effect.succeed(7), placeOrder, {})
  })

  it('Should_ReadDeclaredAttributeType_When_AttrsOfQueried', () => {
    expect<Span.AttrsOf<typeof placeOrder>>().type.toBe<S.Schema.Type<typeof PlaceOrderAttrs>>()
  })

  it('Should_BeAssignableToIdentityFace_When_SpecificDeclarationCitesTaxonomy', () => {
    expect(placeOrder).type.toBeAssignableTo<Span.Span>()
  })

  it('Should_KeepSpanNameLiteral_When_DeclareCalled', () => {
    expect(placeOrder.name).type.toBe<'checkout.place_order'>()
  })
})
