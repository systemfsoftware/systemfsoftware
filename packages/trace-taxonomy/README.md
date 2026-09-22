# @systemfsoftware/trace-taxonomy

Declare the spans a behaviour must produce, once, and start them only through that declaration.

A span name that lives at its emit site is a string nobody owns: renaming it breaks every spec that mentioned it, and adding a required attribute breaks nothing at all until production. A declared span puts the name and the attribute set in one place and makes the compiler answer for both.

## Install

```sh
pnpm add @systemfsoftware/trace-taxonomy effect
```

## Declare a span

```ts
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, Schema } from 'effect'

export const PlaceOrder = Span.declare({
  id: 'checkout.place_order',
  name: 'checkout.place_order',
  attrs: Schema.Struct({
    'app.user.id': Schema.String,
    'app.order.items.count': Schema.Finite,
  }),
})
```

`start` takes the attribute record the declaration promises and returns a wrapper for the effect the span covers:

```ts
const placeOrder = (userId: string, items: number) =>
  PlaceOrder.start({ 'app.user.id': userId, 'app.order.items.count': items })(
    settleOrder(userId),
  )
```

Omitting `app.order.items.count`, misspelling it, or passing a string for it is a compile error. Adding a required attribute to the declaration turns every existing start call red — which is the point.

## Compose a taxonomy

```ts
import { Edge, Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'

export const checkout = Taxonomy.make({
  id: 'checkout',
  spans: [PlaceOrder, PaymentCapture, PaymentRefund],
  edges: [Edge.child(PlaceOrder, PaymentCapture)],
  forbid: [{ span: PaymentRefund, unless: 'error-path' }],
})
```

A taxonomy says which spans exist, which parent-child facts are legal, and which spans are forbidden on a path. Membership grants no emit authority: a span still starts through its own declaration, and a taxonomy is only ever read by whatever relates a finished trace to it.

## What this package does not do

It never observes, exports, collects, or samples a span; it depends on `effect` and nothing else. Reading a finished trace back and relating it to a taxonomy is [`@systemfsoftware/trace-spec`](../trace-spec), so code that only emits spans never pulls an observability SDK.

## API

| Export                                        | What it is                                          |
| --------------------------------------------- | --------------------------------------------------- |
| `Span.declare({ id, name, attrs })`           | The declaration; returns the value carrying `start` |
| `Span.DeclaredSpan<Attrs>`                    | A declaration with its attribute type               |
| `Span.SpanRef`                                | The identity face a taxonomy or a relation cites    |
| `Span.AttrsOf<T>`                             | The attribute record a declaration promises         |
| `Taxonomy.make({ id, spans, edges, forbid })` | The composed contract                               |
| `Edge.child` / `Edge.descendant`              | Legal parent-child facts                            |
