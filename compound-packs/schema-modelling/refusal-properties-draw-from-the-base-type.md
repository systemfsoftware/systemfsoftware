---
title: A refusal a consumer can observe is proven through that consumer, and any other refusal property draws from the unrefined base type and judges each draw by the domain contract
applies_when:
  - adding a refinement to a schema
  - writing a property that checks what a schema refuses
tags: [schema, refusal, property-test, oracle]
---

A refusal a decider, workflow or public entry can observe is proven through that consumer, never by a refusal property on the schema.

A refusal no consumer can observe is proven by a refusal property that passes the unrefined base schema in `of` (of: [S.Finite], of: [S.String]), never the refined schema and never an Arbitrary.schema(...) wrapper of a stock schema. Its expected verdict comes from a predicate written from the domain contract, never copied from the refinement. It appends to every draw the base type's edge values and each bound the contract states (for numbers -1, 0, the contract's bounds, NaN and both infinities; for strings the empty string).

Decision test: does the property's `of` draw from the refined schema, or does its predicate restate the refinement's own regex or bounds? If either, the rule fails.

Defect prevented: a property drawn from the refined schema only ever sees values the refinement accepts, so it reduces to "values built to pass the check pass the check". A widened refinement stays green and its mutants survive.

```typescript
// WRONG: draws only accepted values
it.prop('∀n_Amount_=Decode', { of: [Amount], subject: amountDecodes }, (subject, [value]) => subject(value))
```

```typescript
// RIGHT: draws from the base type and judges by the contract "an amount is a finite number of zero or more"
const seeds = [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
const nonNegativeFinite = (n: number): boolean => Number.isFinite(n) && n >= 0
it.prop(
  '∀n_AmountRefusal_≡NonNegative',
  { of: [S.Finite], subject: amountDecodes },
  (subject, [value]) => Arr.every(Arr.append(seeds, value), (n) => subject(n) === nonNegativeFinite(n)),
)
```

Source: systemfsoftware docs/solutions/design-patterns/generated-schema-laws-are-tautological.md (every pattern-widening mutant survived while the round-trip laws stayed green, because their generator is built from the refinement under test; "Read the generator off the domain contract, not off the regex").

Gate: judge
