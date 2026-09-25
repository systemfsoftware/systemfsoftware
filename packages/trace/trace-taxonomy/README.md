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

`Span.start` is a standalone dual combinator. Data-last it wraps the effect the span covers:

```ts
const placeOrder = (userId: string, items: number) =>
  settleOrder(userId).pipe(
    Span.start(PlaceOrder, { 'app.user.id': userId, 'app.order.items.count': items }),
  )
```

Data-first it takes the effect directly: `Span.start(settleOrder(userId), PlaceOrder, attributes)`. Either way the span carries the declared name and exactly the declared attributes. Omitting `app.order.items.count`, misspelling it, or passing a string for it is a compile error. Adding a required attribute to the declaration turns every start call site red — which is the point. The declared name keeps its literal type, so a shell that must emit a span under this name reads `PlaceOrder.name` instead of restating the string.

## Compose a taxonomy

```ts
import { Taxonomy } from '@systemfsoftware/trace-taxonomy'

export const checkout = Taxonomy.make('checkout').pipe(
  Taxonomy.add(PaymentRefund),
  Taxonomy.child(PlaceOrder, PaymentCapture),
  Taxonomy.forbid(PaymentRefund, { unless: 'error-path' }),
)
```

`Taxonomy.make(id)` requires the taxonomy's identity before any combinator runs; every combinator is a dual, immutable step that returns a new taxonomy and declares the spans it cites (`child` and `descendant` declare both endpoints, `forbid` declares its span, and declarations dedupe by id). A taxonomy says which spans exist, which parent-child facts are legal, and which spans are forbidden on a path. Membership grants no emit authority: a span still starts through its own declaration, and a taxonomy is only ever read by whatever relates a finished trace to it.

## What this package does not do

It never observes, exports, collects, or samples a span; it depends on `effect` and nothing else. Reading a finished trace back and relating it to a taxonomy is [`@systemfsoftware/trace-spec`](../trace-spec), so code that only emits spans never pulls an observability SDK.

## API

| Export                                                       | What it is                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `Span.declare({ id, name, attrs })`                          | The declaration; the name stays a literal type              |
| `Span.start(span, attributes)`                               | Dual wrapper that starts the declared span around an effect |
| `Span.Span<Attrs>`                                           | The Pipeable declaration value                              |
| `Span.AttrsOf<T>`                                            | The attribute record a declaration promises                 |
| `Span.AttributeValue` / `Span.AttributeRecord`               | The closed attribute value set                              |
| `Span.isSpan`                                                | Type guard for a declaration                                |
| `Taxonomy.make(id)`                                          | The identity-first staged builder                           |
| `Taxonomy.add(span)`                                         | Declare a span (deduped by id)                              |
| `Taxonomy.child` / `Taxonomy.descendant`                     | Legal parent-child facts; declare both endpoints            |
| `Taxonomy.forbid(span, { unless })`                          | Forbid a span on a path; declares it too                    |
| `Taxonomy.Taxonomy` / `Taxonomy.Edge` / `Taxonomy.Forbidden` | The contract types                                          |
| `Taxonomy.isTaxonomy`                                        | Type guard for a taxonomy                                   |
