---
title: Mutually exclusive states are a tagged union, never a record whose state shows in which fields are present
applies_when:
  - a schema has an optional field that is present only for some value of a status, kind, or boolean flag
  - a schema uses absent fields to mean something ("no limit", "not finished")
  - a decider, handler, or cell branches on whether a field is present, or on a status before reading a field
  - designing a schema for something with a lifecycle or several outcomes
tags: [schema-laws, tagged-union, illegal-states, CONST-D4, optional, anemic-schema]
---

`{ status: 'matched' | 'uncertain', reason?: string }` admits a matched case with a reason and an uncertain case without one. Neither means anything, both decode, and every consumer must guard against them. CONST-D4 in `CONSTITUTION.md` states the law: model mutually exclusive states as a tagged union, one variant per state. This rule applies it to Effect Schema.

## Rule

1. **One variant per state.** Use `S.TaggedStruct` variants (or `S.TaggedClass` where `data-only-schema-classes` requires a class), combined with `S.Union` or `S.TaggedUnion`. When the record already has a discriminant (`status`, `kind`), keep it as the tag with `S.toTaggedUnion('<field>')` instead of adding `_tag`. Each variant carries exactly the fields valid in that state, and they are required there.
2. **The defect is correlation.** An optional that correlates with a discriminant, a status literal, or a boolean flag is a hidden state. An optional that is absent the same way in every state (a genuinely optional note) is allowed.
3. **Absence never carries meaning.** "No limit" is an `Unlimited` variant, not a missing number. `Option` or `NullOr` over the same field renames the hole without closing it.
4. **Consumers match, they do not probe.** Dispatch with `Match.tag`, `Match.exhaustive`, or the union's `match`/`guards` (`S.TaggedUnion`, `S.toTaggedUnion`). Delete the presence checks (`?.`, `??`, `'reason' in x`) the union makes unnecessary.

Changing a record into a union changes its encoded shape (a field becomes required in one variant and disappears from the others, or a `_tag` appears); ship that as a wire change with its changeset.

```ts
import { Schema as S } from 'effect'

export const CaseTrace = S.Union([
  S.Struct({ id: S.String, status: S.Literal('Match') }),
  S.Struct({ id: S.String, status: S.Literal('Miss') }),
  S.Struct({ id: S.String, status: S.Literal('Uncertain'), reason: S.String }),
]).pipe(S.toTaggedUnion('status'))
```

Working example: `packages/discern/src/Inspection.schema.ts` (`CaseTrace`, and `DecisionInspection` keyed by `kind`); `packages/discern/src/Budget.schema.ts` (`Unlimited` or a bounded limit).

Gate: `review`.
