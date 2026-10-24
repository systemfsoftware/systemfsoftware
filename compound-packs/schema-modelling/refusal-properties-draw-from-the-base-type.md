---
title: A refusal property draws from the unrefined base type and judges each draw with a predicate written from the domain contract
applies_when:
  - adding a refinement whose refusal no decider, workflow or public entry can observe
  - writing a property that checks what a schema refuses
tags: [schema, refusal, property-test, oracle]
---

A refusal a decider, workflow or public entry can observe is proven through that consumer, never by a refusal property on the schema.

A refusal property passes the unrefined base schema itself in `of` (of: [S.Finite], of: [S.String]), never the refined schema and never an Arbitrary.schema(...) wrapper of a stock schema.

Its expected verdict comes from a predicate written from the domain contract, never copied from the refinement.

It appends to every draw the base type's edge values and each bound the domain contract states (for numbers -1, 0, the contract's bounds, NaN and both infinities; for strings the empty string).

```typescript
// WRONG
it.prop('∀n_Amount_=Decode', { of: [Amount], subject: amountDecodes }, (subject, [value]) => subject(value))
```

```typescript
// RIGHT
const seeds = [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
const nonNegativeFinite = (n: number): boolean => Number.isFinite(n) && n >= 0
it.prop('∀n_AmountRefusal_≡NonNegative', { of: [S.Finite], subject: amountDecodes }, (subject, [value]) =>
  Arr.every(Arr.append(seeds, value), (n) => subject(n) === nonNegativeFinite(n)))
```

Gate: judge
