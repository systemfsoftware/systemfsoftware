---
title: A range arbitraryConstraint names its type's order, and a pattern property tests draw from uses only regex syntax the derivation compiles
applies_when:
  - adding an arbitraryConstraint to an S.makeFilter or S.makeFilterGroup
  - adding an S.isPattern to a schema that property tests or generated laws draw from
  - a property test discards most draws or reports that no step ran
tags: [schema, arbitrary, fast-check, regex]
---

A range in an arbitraryConstraint always names its type's order.

A range in an arbitraryConstraint (minimum, maximum, exclusiveMinimum, exclusiveMaximum) always carries its type's order: Order.Number, Order.BigInt or BigDecimal.Order.

The derivation reads an unordered range only while another check on the same schema supplies the order; the same filter on a schema without one silently generates the type's whole domain, and schema-filter-constructive-generation accepts the unordered constraint.

```typescript
// WRONG
S.makeFilter<number>(isWithinTimeout, { arbitraryConstraint: { minimum: 0, maximum: 60_000 } })
```

```typescript
// RIGHT
S.makeFilter<number>(isWithinTimeout, { arbitraryConstraint: { order: Order.Number, minimum: 0, maximum: 60_000 } })
```

Gate: judge
