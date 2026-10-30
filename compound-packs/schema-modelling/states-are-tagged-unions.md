---
title: Mutually exclusive states are a tagged union, never a record whose state shows in which fields are present
applies_when:
  - a schema has a field present only for some status, kind or flag value
  - absence of a field is meant to say something, such as no limit or not finished
  - a consumer branches on whether a field is present
tags: [schema, tagged-union, states, optional]
---

Model mutually exclusive states as one variant per state, each requiring exactly that state's fields. An existing discriminant (status, kind) stays the tag through `S.toTaggedUnion('<field>')` rather than an added `_tag`.

Never leave a field optional, Option or nullable only because a status, kind or flag value leaves it empty; split it into variants. A value absent the same way in every state stays a plain optional. Absence never carries meaning: "no limit" is an `Unlimited` variant, not a missing number.

Dispatch on state with `Match.tag`, `Match.exhaustive` or the union's match and guards, never by probing whether a field is present (`?.`, `??`, `'reason' in value`).

```typescript
// WRONG
S.Struct({ id: S.String, status: S.Literals(['Match', 'Uncertain']), reason: S.optional(S.String) })
// RIGHT
S.Union([
  S.Struct({ id: S.String, status: S.Literal('Match') }),
  S.Struct({ id: S.String, status: S.Literal('Uncertain'), reason: S.String }),
]).pipe(S.toTaggedUnion('status'))
```
