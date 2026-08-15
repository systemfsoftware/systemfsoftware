---
'@systemfsoftware/effect-cell-types': minor
---

Add the Wire alphabet: a declaration is built from members this workspace mints, so a foreign type
named in a wire declaration is a compile error at the authoring site rather than a lint finding
somewhere else. Marking sits on the schema, not the decoded value, and every combinator takes marked
inputs and returns marked outputs, so a workspace-local alias of a vendor type confers no mark and is
refused too. The alphabet covers primitives, literals, `nullOr`, `undefinedOr`, `nullishOr`, `array`,
`optional`, `record`, `union`, `tuple`, `suspend` and `refine`, which is wide enough that a real
payload does not have to escape it to be expressed. `transform` and `compose` are deliberately
absent, being the laundering hop the alphabet exists to refuse.

What this does not do: the mark is a phantom, and TypeScript has no nominal types, so any value
legitimately carrying it can donate it to another type by intersection — `Object.assign` over a
marked primitive is enough, and writing the intersection out is enough. Five such routes are pinned
by type tests as accepted. The alphabet therefore refuses the accidental case and makes no claim to
be an enumerable set of doors; deciding admissibility belongs to a checker that resolves where a
member's type was declared.
