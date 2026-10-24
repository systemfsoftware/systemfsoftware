---
title: A value's domain rule is a check on the schema that declares it, never a re-check in code that consumes the decoded value
applies_when:
  - declaring a schema field whose values obey a rule (a bound, a format, a closed set, a relation to another field)
  - a decider, handler or cell re-checks a value it already decoded
  - a test declares its own refined schema for a concept production keeps bare
tags: [schema, invariants, refinement, struct-check]
---

A field whose domain has a rule carries it as a check where the field is declared: a built-in check (S.isBetween, S.isGreaterThanOrEqualTo, S.isPattern, S.isInt) or S.Literals for a closed set.

A rule relating two fields of one value is a check on their struct (S.Struct({...}).check(S.makeFilter(...))), never a comparison in a consumer.

A re-check is a condition that every valid value of the declared type must meet (n < 0 on a quantity, a format regex on an id, end < start on a window); a decider, handler or cell never performs one on a decoded value, the condition moves into the schema and the consumer check is deleted.

A custom S.makeFilter states its invariant as a domain sentence in its message.

A test never declares a refined schema for a concept production keeps bare; the refinement moves into the production schema.

```typescript
// WRONG
const Order = S.Struct({ qty: S.Number })
// in the decider
if (order.qty < 0) return Rejected.make({ reason: 'negative quantity' })
```

```typescript
// RIGHT
const Order = S.Struct({
  qty: S.Int.check(S.isGreaterThanOrEqualTo(0, { message: 'a quantity is a whole number of zero or more' })),
})
```

Gate: judge
