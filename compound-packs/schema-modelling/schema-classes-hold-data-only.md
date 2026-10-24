---
title: A schema class is declared only for a Workflow.make command, a decision variant or a TaggedError, and holds no methods
applies_when:
  - declaring a schema with Schema.Class, Schema.TaggedClass or Schema.TaggedError
  - adding a method, getter or static to a schema class
  - writing behaviour over a schema's data
tags: [schema, schema-class, module-functions]
---

Schema.Class and TaggedClass are declared only for a command passed to Workflow.make, a variant of a decision union Workflow.make checks, or a Schema.TaggedError; every other type is S.Struct, S.TaggedStruct, a tagged union or S.Opaque over a struct.

A schema class defines no instance methods, no getter other than a TaggedError's message, and no static other than the [Workflow.InstrumentationBrand] a command carries; its only instance property beyond its fields is its decision family's TypeId.

An operation that would otherwise be a method (a value derived from one instance, a copy with a changed field) is an exported module function in the *.schema.ts that declares the type; a decision over the data is a Workflow.make in its *.workflow.ts.

```typescript
// WRONG
export class Order extends S.TaggedClass<Order>()('Order', { qty: Quantity, price: Money }) {
  withQty(qty: Quantity) {
    return Order.make({ ...this, qty })
  }
}
```

```typescript
// RIGHT
export const Order = S.TaggedStruct('Order', { qty: Quantity, price: Money })
export type Order = typeof Order.Type
export const withQty = (order: Order, qty: Quantity): Order => ({ ...order, qty })
```

Gate: judge
