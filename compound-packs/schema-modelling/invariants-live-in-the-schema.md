---
title: A value's domain rule is a check on the schema that declares it, never a re-check in code that consumes the decoded value
applies_when:
  - declaring a schema field whose values obey a rule (a bound, a format, a closed set, a relation to another field)
  - a decider, handler or cell re-checks a value it already decoded
  - a test declares its own refined schema for a concept production keeps bare
tags: [schema, invariants, refinement, struct-check]
---

A field whose domain has a rule carries it as a check where the field is declared: a built-in check (S.isBetween, S.isGreaterThanOrEqualTo, S.isPattern, S.isInt) or S.Literals for a closed set. A rule relating two fields of one value is a check on their struct (S.Struct({...}).check(S.makeFilter(...))).

A re-check is a condition every valid value of the declared type must already meet (n < 0 on a quantity, a format regex on an id, end < start on a window). A decider, handler or cell never performs one on a decoded value: the condition moves into the schema and the consumer's check is deleted.

A custom S.makeFilter states its invariant as a domain sentence in its message.

A test never declares a refined schema for a concept production keeps bare; the refinement moves into the production schema.

Decision test: does any condition the diff adds in a decider, handler, cell or test hold for every valid value of a type it already decoded? If yes, the rule fails, and the condition belongs in that type's schema.

Defect prevented: a rule enforced in one consumer is skipped by every other entry, so invalid values pass decode and reach code that trusts them; the consumer's copy and the schema drift apart; and the schema's generator keeps producing values the domain forbids, so properties drawn from it test impossible inputs. A refinement declared only in a test proves a constraint production does not have.

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

Source: systemfsoftware/constitution CONSTITUTION.md, CONST-D1 ("Close your types so an illegal value cannot be constructed"; why: "A value the type could have refused reaches runtime, and every check downstream trusts it"); Alexis King, "Parse, don't validate" (2019), on validation that discards what it learned and forces redundant checks downstream.

Gate: judge
