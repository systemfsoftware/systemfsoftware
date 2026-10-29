---
title: A schema class is declared only for a Workflow.make command, a decision variant or a TaggedError, and holds no methods
applies_when:
  - declaring a schema with Schema.Class, Schema.TaggedClass or Schema.TaggedError
  - adding a method, getter or static to a schema class
  - writing behaviour over a schema's data
tags: [schema, schema-class, module-functions]
---

Schema.Class and TaggedClass are declared only for a command passed to Workflow.make, a variant of a decision union Workflow.make checks, or a Schema.TaggedError. Every other type is S.Struct, S.TaggedStruct, a tagged union or S.Opaque over a struct.

A schema class defines no instance method, no getter other than a TaggedError's message, and no static other than the [Workflow.InstrumentationBrand] a command carries; its only instance property beyond its fields is its decision family's TypeId.

An operation that would otherwise be a method (a value derived from one instance, a copy with a changed field) is an exported function in the *.schema.ts that declares the type; a decision over the data is a Workflow.make in its *.workflow.ts.

Decision test: does the diff declare a schema class that is not a Workflow.make command, decision variant or TaggedError, or add a method, getter or static beyond the ones named above? If yes, the rule fails.

Defect prevented: a decision written as a method sits outside the *.workflow.ts files where Workflow.make checks the decision's shape and where mutation testing runs, so it is neither shape-checked nor mutated. A method also lives on the class prototype, so a copy made by spreading the value silently loses it.

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

Source: systemfsoftware docs/solutions/architecture-patterns/workflow-success-channel-tagged-union.md (Workflow.make refuses a decision channel that is not a union of S.TaggedClass variants sharing one family TypeId); packages/toolchain/stryker-config/README.md in the same repository (mutation testing mutates only src/**/*.workflow.ts).

Gate: judge
