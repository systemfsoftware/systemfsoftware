---
title: A range arbitraryConstraint names its type's order, and a pattern that property tests draw from uses only regex syntax the derivation compiles
applies_when:
  - adding an arbitraryConstraint to an S.makeFilter or S.makeFilterGroup
  - adding an S.isPattern to a schema that property tests or generated laws draw from
  - a property test discards most draws, reports SampleError or Exhausted, or reports that no step ran
tags: [schema, arbitrary, fast-check, regex, generation]
---

Always give a range in an `arbitraryConstraint` (minimum, maximum, exclusiveMinimum, exclusiveMaximum) its type's order: `Order.Number`, `Order.BigInt` or `BigDecimal.Order`. The derivation applies a numeric range only when the constraint carries that order; an unordered range is ignored when the filter is reused on a schema without another check supplying one.

Never write a pattern on a schema that property tests or generated laws draw from with syntax the derivation cannot compile: no `i`, `m` or `v` flag, no lookahead or lookbehind, no `\b` or `\B` outside a character class, no `\p`, `\P` or `\k` escape, no numeric backreference. Such a pattern is applied only as a filter after generation.

```typescript
// WRONG: no order, so the range is ignored; the i flag makes the pattern a filter only
S.makeFilter<number>(isWithinTimeout, { arbitraryConstraint: { minimum: 0, maximum: 60_000 } })
S.String.check(S.isPattern(/^[a-z]+$/i))
// RIGHT
S.makeFilter<number>(isWithinTimeout, { arbitraryConstraint: { order: Order.Number, minimum: 0, maximum: 60_000 } })
S.String.check(S.isPattern(/^[A-Za-z]+$/))
```
