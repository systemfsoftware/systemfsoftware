---
title: Mutually exclusive states are a tagged union, never a record whose state shows in which fields are present
applies_when:
  - a schema has a field present only for some status, kind or flag value
  - absence of a field is meant to say something, such as no limit or not finished
  - a consumer branches on whether a field is present
tags: [schema, tagged-union, states, optional]
---

Mutually exclusive states are one variant per state, each requiring exactly that state's fields; an existing discriminant (status, kind) stays the tag through S.toTaggedUnion('<field>') instead of an added _tag.

An optional field whose presence follows a status, kind or boolean flag is split into variants; wrapping it in Option or NullOr does not close the hole. A value absent the same way in every state stays a plain optional.

Absence never carries meaning: no limit is an Unlimited variant, never a missing number.

Consumers dispatch on state with Match.tag, Match.exhaustive or the union's match and guards, never by probing whether a field is present (?., ??, 'reason' in value).

Decision test: does the diff add or keep a field that is optional, Option or nullable only because some value of a status, kind or flag field leaves it empty, or a consumer that branches on that field's presence? If yes, the rule fails.

Defect prevented: a record whose state is read off its fields lets the compiler accept an invalid mix (a Match carrying a reason, an Uncertain without one), and every consumer guesses the state from which fields are present.

```typescript
// WRONG
S.Struct({ id: S.String, status: S.Literals(['Match', 'Uncertain']), reason: S.optional(S.String) })
```

```typescript
// RIGHT
S.Union([
  S.Struct({ id: S.String, status: S.Literal('Match') }),
  S.Struct({ id: S.String, status: S.Literal('Uncertain'), reason: S.String }),
]).pipe(S.toTaggedUnion('status'))
```

Source: systemfsoftware/constitution CONSTITUTION.md, CONST-D4 ("Model mutually exclusive states as a tagged union, one variant per state carrying only its own fields; keep a plain nullable for a value absent the same way in every state"; why: "the compiler cannot reject an invalid mix of fields"); Yaron Minsky, "Effective ML Revisited", Jane Street blog, "Make illegal states unrepresentable".

Gate: judge
