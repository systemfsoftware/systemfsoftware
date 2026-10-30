---
title: A value's domain rule is a check on the schema that declares it, never a re-check in code that consumes the decoded value
applies_when:
  - declaring a schema field whose values obey a rule (a bound, a format, a closed set, a relation to another field)
  - a decider, handler or cell re-checks a value it already decoded
  - a test declares its own refined schema for a concept production keeps bare
tags: [schema, invariants, refinement, struct-check]
---

Declare a field's domain rule as a check where the field is declared: a built-in check (`S.isBetween`, `S.isGreaterThanOrEqualTo`, `S.isPattern`, `S.isInt`) or `S.Literals` for a closed set. A rule relating two fields of one value is a check on their struct (`S.Struct({...}).check(S.makeFilter(...))`). A custom `S.makeFilter` states its invariant as a domain sentence in its message.

Never re-check in a decider, handler or cell a condition every valid value of the decoded type must already meet (`n < 0` on a quantity, a format regex on an id, `end < start` on a window). Move it into the schema and delete the consumer's check.

Never declare a refined schema in a test for a concept production keeps bare; move the refinement into the production schema.

```typescript
// WRONG
if (order.qty < 0) return Rejected.make({ reason: 'negative quantity' })
// RIGHT
S.Int.check(S.isGreaterThanOrEqualTo(0, { message: 'a quantity is a whole number of zero or more' }))
```
