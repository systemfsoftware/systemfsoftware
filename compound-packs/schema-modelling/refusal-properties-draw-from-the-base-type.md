---
title: A refusal a consumer can observe is proven through that consumer, and any other refusal property draws from the unrefined base type and judges each draw by the domain contract
applies_when:
  - adding a refinement to a schema
  - writing a property that checks what a schema refuses
tags: [schema, refusal, property-test, oracle]
---

Prove a refusal a decider, workflow or public entry can observe through that consumer, never by a refusal property on the schema.

Prove a refusal no consumer can observe with a refusal property that passes the unrefined base schema in `of` (`of: [S.Finite]`, `of: [S.String]`), never the refined schema or an `Arbitrary.schema(...)` wrapper of a stock schema. Take the expected verdict from a predicate written from the domain contract, never copied from the refinement's regex or bounds. Append to every draw the base type's edge values and each bound the contract states (numbers: -1, 0, the bounds, NaN and both infinities; strings: the empty string).

```typescript
// WRONG: draws only accepted values
it.prop('Amount decodes', { of: [Amount], subject: amountDecodes }, (subject, [value]) => subject(value))
// RIGHT: draws from the base type, judges by "an amount is a finite number of zero or more"
it.prop(
  'Amount refusal',
  { of: [S.Finite], subject: amountDecodes },
  (subject, [value]) => Arr.every(Arr.append(seeds, value), (n) => subject(n) === (Number.isFinite(n) && n >= 0)),
)
```
