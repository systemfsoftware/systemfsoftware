/// <reference types="vitest/importMeta" />
import { Effect, Schema } from 'effect'

const SpanTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-taxonomy/Span')

export type AttributeValue = string | number | boolean | ReadonlyArray<string | number | boolean>

export type AttributeRecord = { readonly [key: string]: AttributeValue }

export interface SpanRef<Attrs extends AttributeRecord = AttributeRecord> {
  readonly [SpanTypeId]: typeof SpanTypeId
  readonly id: string
  readonly name: string
  readonly attrsSchema: Schema.Schema<Attrs>
}

export interface DeclaredSpan<Attrs extends AttributeRecord> extends SpanRef<Attrs> {
  readonly start: (
    attributes: Attrs,
  ) => <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

export type AttrsOf<S> = S extends DeclaredSpan<infer Attrs> ? Attrs : never

export type DeclareOptions<Attrs extends AttributeRecord> = {
  readonly id: string
  readonly name: string
  readonly attrs: Schema.Schema<Attrs>
}

const annotateStart = <Attrs extends AttributeRecord, A, E, R>(
  name: string,
  attributes: Attrs,
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.withSpan(
    Effect.gen(function*() {
      yield* Effect.annotateCurrentSpan(attributes)
      return yield* self
    }),
    name,
  )

export const declare = <Attrs extends AttributeRecord>(
  options: DeclareOptions<Attrs>,
): DeclaredSpan<Attrs> => ({
  [SpanTypeId]: SpanTypeId,
  id: options.id,
  name: options.name,
  attrsSchema: options.attrs,
  start: (attributes) => (self) => annotateStart(options.name, attributes, self),
})

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')

  const CheckoutAttrs = Schema.Struct({
    'app.user.id': Schema.String,
    'app.order.items.count': Schema.Finite,
  })
  const CHECKOUT = 'checkout.place_order'

  it.prop('∀a_Annotate_=Declared', [CheckoutAttrs], ([attrs]) =>
    Effect.gen(function*() {
      const span = yield* annotateStart(CHECKOUT, attrs, Effect.currentSpan)
      return span.name === CHECKOUT &&
        Object.entries(attrs).every(([key, value]) => span.attributes.get(key) === value)
    }))

  it.prop('∀a_Annotate_=Identity', [CheckoutAttrs], ([attrs]) =>
    Effect.gen(function*() {
      const succeeded = yield* annotateStart(CHECKOUT, attrs, Effect.succeed(42))
      const failed = yield* annotateStart(CHECKOUT, attrs, Effect.flip(Effect.fail('boom')))
      return succeeded === 42 && failed === 'boom'
    }))
}
