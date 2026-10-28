---
title: A range arbitraryConstraint names its type's order, and a pattern that property tests draw from uses only regex syntax the derivation compiles
applies_when:
  - adding an arbitraryConstraint to an S.makeFilter or S.makeFilterGroup
  - adding an S.isPattern to a schema that property tests or generated laws draw from
  - a property test discards most draws, reports SampleError or Exhausted, or reports that no step ran
tags: [schema, arbitrary, fast-check, regex, generation]
---

A range in an arbitraryConstraint (minimum, maximum, exclusiveMinimum, exclusiveMaximum) always carries its type's order: Order.Number, Order.BigInt or BigDecimal.Order. The derivation applies a numeric range only when the constraint carries that order. An unordered range works only while another check on the same schema happens to supply the order, so the same filter reused on a schema without one is generated as if it had no range.

A pattern on a schema that property tests or generated laws draw from uses no syntax the derivation cannot compile: no i, m or v flag, no lookahead or lookbehind, no \b or \B outside a character class, no \p, \P or \k escape, and no numeric backreference. A pattern written another way is applied only as a filter after generation.

Decision test: for every arbitraryConstraint range in the diff, is an order named in that same constraint, and does every S.isPattern on a schema that a property draws from avoid the syntax listed above? If either answer is no, the rule fails.

Defect prevented: when the derivation cannot use a bound or a pattern, it generates from the type's whole domain and discards each draw the check refuses. A narrow range or pattern then exhausts the discard limit, so the property errors with SampleError or Exhausted, or spends its runs on discarded draws, and the schema is never exercised.

```typescript
// WRONG: no order, so the range is ignored; the i flag makes the pattern a filter only
S.makeFilter<number>(isWithinTimeout, { arbitraryConstraint: { minimum: 0, maximum: 60_000 } })
S.String.check(S.isPattern(/^[a-z]+$/i))
```

```typescript
// RIGHT
S.makeFilter<number>(isWithinTimeout, { arbitraryConstraint: { order: Order.Number, minimum: 0, maximum: 60_000 } })
S.String.check(S.isPattern(/^[A-Za-z]+$/))
```

Source: Effect 4 ARBITRARY.md, "Schema Checks and Rejected Values" (supported checks are generated directly; other checks reject draws, bounded by maxDiscards) and its notes that unsupported patterns "act as ordinary filters"; Effect 4 source, internal/arbitrary/schema.ts (a numeric range is read only when its constraint's order is Order.Number, Order.BigInt or BigDecimal.Order) and internal/arbitrary/regexp.ts (the compile function refuses the i, m and v flags, lookaround groups, \B, \b outside a class, \p, \P, \k and decimal escapes).

Gate: judge
