---
title: A schema class exists only where a contract requires one, and holds data only
applies_when:
  - declaring a schema with `Schema.Class`, `Schema.TaggedClass`, or `Schema.TaggedError`
  - adding a method, getter, or static to a schema class
  - writing behavior over a schema's data
  - spreading, destructuring, or passing around a decoded schema class instance
tags: [schema-laws, schema-class, TaggedClass, static-land, module-functions, Workflow.make]
---

A schema class instance is recognized by its prototype (`repos/effect/packages/effect/src/Schema.ts`, the `ClassTypeId` getter). Three failures follow, observed against Effect v4 on 2026-09-25:

- `{ ...instance }` keeps the fields and drops the prototype. The copy fails `S.is`, fails to encode, and loses its getters.
- A method pulled off its instance (`const f = order.withQty`, a callback, a destructure) throws on `this`.
- `lines.map(Order.make)` throws, because Effect's own static `make` reads `this`.

## Rule

1. **A class only where a contract requires one.** Keep a schema class for exactly three cases: a command passed to `Workflow.make` (it carries `static readonly [Workflow.InstrumentationBrand]`), a variant of a decision union whose family TypeId `Workflow.make` checks (`docs/solutions/architecture-patterns/workflow-success-channel-tagged-union.md`), and a `Schema.TaggedError`. Confirm the contract against the actual `Workflow.make` call before keeping one.
2. **Everything else is plain data.** `S.Struct`, `S.TaggedStruct`, a tagged union, or `S.Opaque` over a struct when a nominal type is needed. Converting keeps the tag and fields, so the encoded shape does not change.
3. **Kept classes hold data.** A kept class may define derived getters that take no arguments, have no side effects, and read only the instance's own fields. It defines no instance methods and no statics beyond schema metadata.
4. **Behavior is module functions.** Functions over schema data live in an unsuffixed sibling module named after the type (`Order.ts` beside `order.schema.ts`); a `*.schema.ts` exports only schemas (`schema-file-exports-schemas-only`), and the cell-architecture pack bans new file suffixes (pack: cell-architecture, service-and-layer-boundaries.md).

```ts
// decision.schema.ts: a decision variant Workflow.make requires as a class
export class Allocated extends S.TaggedClass<Allocated>()('Allocated', { qty: Quantity, price: Money }) {
  get total(): number {
    return this.qty * this.price
  } // allowed: derived, argument-free, pure
}

// Allocated.ts: behavior is a module function, never `withQty` on the class
export const withQty = (allocated: Allocated, qty: Quantity): Allocated =>
  Allocated.make({ qty, price: allocated.price })
```

Working example: `examples/inventory-fulfillment/src/fulfillment/place-order.workflow.ts` (the command and the decision variants `Workflow.make` checks stay classes; the data they carry, such as `LotReservation`, is a struct) beside `examples/inventory-fulfillment/src/inventory/inventory.schema.ts` (data as structs).

Gate: `review`. Spreading an instance is also reported by `typescript/no-misused-spread`, which the recommended preset enables through the `correctness` category.
