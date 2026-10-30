---
title: A schema class is declared only for a Workflow.make command, a decision variant or a TaggedError, and holds no methods
applies_when:
  - declaring a schema with Schema.Class, Schema.TaggedClass or Schema.TaggedError
  - adding a method, getter or static to a schema class
  - writing behaviour over a schema's data
tags: [schema, schema-class, module-functions]
---

Declare `Schema.Class` and `TaggedClass` only for a command passed to `Workflow.make`, a variant of a decision union `Workflow.make` checks, or a `Schema.TaggedError`. Every other type is `S.Struct`, `S.TaggedStruct` or a tagged union.

A schema class defines no instance method, no getter other than a TaggedError's message, and no static other than the `[Workflow.InstrumentationBrand]` a command carries.

Write an operation that would be a method (a value derived from one instance, a copy with a changed field) as an exported function in the `*.schema.ts` that declares the type; write a decision over the data as a `Workflow.make` in its `*.workflow.ts`.

```typescript
// WRONG
export class Order extends S.TaggedClass<Order>()('Order', { qty: Quantity }) {
  withQty(qty: Quantity) { return Order.make({ ...this, qty }) }
}
// RIGHT
export const Order = S.TaggedStruct('Order', { qty: Quantity })
export const withQty = (order: Order, qty: Quantity): Order => ({ ...order, qty })
```
