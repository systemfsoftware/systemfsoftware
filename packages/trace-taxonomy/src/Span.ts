/// <reference types="vitest/importMeta" />
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import { Prototype } from 'effect/Pipeable'
import type { Pipeable } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

const TypeId: unique symbol = Symbol.for('@systemfsoftware/trace-taxonomy/Span')

export type AttributeValue = string | number | boolean | ReadonlyArray<string | number | boolean>

export type AttributeRecord = { readonly [key: string]: AttributeValue }

/**
 * A span declaration is a value, not a factory: membership grants no emit authority, and the only
 * way to start the span is {@link start}.
 */
export interface Span<Attrs extends AttributeRecord = AttributeRecord> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly id: string
  readonly name: string
  readonly attrs: Schema.Schema<Attrs>
}

export type AttrsOf<S> = S extends Span<infer Attrs> ? Attrs : never

export const isSpan = (input: unknown): input is Span => Predicate.hasProperty(input, TypeId)

export const declare = <Attrs extends AttributeRecord, const Name extends string>(options: {
  readonly id: string
  readonly name: Name
  readonly attrs: Schema.Schema<Attrs>
}): Span<Attrs> & { readonly name: Name } => ({
  [TypeId]: TypeId,
  id: options.id,
  name: options.name,
  attrs: options.attrs,
  ...Prototype,
})

const started = <A, E, R, Attrs extends AttributeRecord>(
  self: Effect.Effect<A, E, R>,
  span: Span<Attrs>,
  attributes: Attrs,
): Effect.Effect<A, E, R> => Effect.withSpan(self, span.name, { attributes })

export const start: {
  <Attrs extends AttributeRecord>(span: Span<Attrs>, attributes: Attrs): <A, E, R>(
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>
  <A, E, R, Attrs extends AttributeRecord>(
    self: Effect.Effect<A, E, R>,
    span: Span<Attrs>,
    attributes: Attrs,
  ): Effect.Effect<A, E, R>
} = dual(3, started)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published module graph.
  const { it } = await import('@effect/vitest')

  const CheckoutAttrs = Schema.Struct({
    'app.user.id': Schema.String,
    'app.order.items.count': Schema.Finite,
  })
  const CHECKOUT = 'checkout.place_order'

  const Checkout = declare({ id: CHECKOUT, name: CHECKOUT, attrs: CheckoutAttrs })

  it.prop('∀a_Start_=Declared', [CheckoutAttrs], ([attrs]) =>
    Effect.gen(function*() {
      const span = yield* started(Effect.currentSpan, Checkout, attrs)
      return span.name === CHECKOUT &&
        Object.entries(attrs).every(([key, value]) => span.attributes.get(key) === value)
    }))

  it.prop('∀a_Start_=Identity', [CheckoutAttrs], ([attrs]) =>
    Effect.gen(function*() {
      const succeeded = yield* started(Effect.succeed(42), Checkout, attrs)
      const failed = yield* Effect.flip(started(Effect.fail('boom'), Checkout, attrs))
      return succeeded === 42 && failed === 'boom'
    }))
}
