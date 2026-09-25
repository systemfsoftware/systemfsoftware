---
title: A rule that relates two fields is a struct-level check, not a guard in the code that reads the struct
applies_when:
  - a schema has fields whose values constrain each other (an ordering, a sum, a bound one field sets for another)
  - consuming code compares two fields of a decoded value before trusting it
  - adding a check to a `Schema.Struct` or record
tags: [schema-laws, cross-field, struct-check, invariants, makeFilter]
---

A struct whose fields are each valid can still be invalid as a whole: `end` before `start`, parts that do not sum to the total, a retry count above the ceiling another field sets. A field-level refinement cannot see the other field, so the rule ends up in whichever consumer remembered it.

## Rule

1. **Put the relation on the struct.** Declare it as `S.Struct({...}).check(S.makeFilter(predicate, { message }))`, or `S.makeFilterGroup` for several relations. The `message` states the relation as a domain sentence ("a window's end is not before its start").
2. **Scope.** This rule covers relations among values that are present in every state. When a field's _presence_ depends on a status, kind, or flag, that is a hidden state, and `tagged-unions-over-state-by-presence` governs it instead.
3. **Generation follows density.** A dense relation (most random draws pass) is left to Effect's rejection sampling; a sparse one becomes `S.declare` with a `toCodecArbitrary` that builds valid values. `docs/solutions/architecture-patterns/cross-field-schema-invariants-and-arbitrary-derivation.md` holds the measurements and the dividing line; do not restate it.
4. **Delete the consumer comparison** once the struct carries the relation.

Each relation carries a refusal property (`refusals-beside-generated-laws`): draw the unrefined struct, and compare decode success against the relation written independently.

```ts
import { Schema as S } from 'effect'

export const Window = S.Struct({ start: S.Finite, end: S.Finite }).check(
  S.makeFilter((w) => w.end >= w.start, { message: "a window's end is not before its start" }),
)
```

Working example: `packages/daemon/effect-daemon-spec/src/kernel/SupervisorPolicy.schema.ts` (a dense cross-field policy invariant as a bare struct check, with its refusal properties).

Gate: `review`.
