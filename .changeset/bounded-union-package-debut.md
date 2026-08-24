---
"@systemfsoftware/effect-schema-bounded-union": minor
---

A recursive Effect `Schema` union whose generated values terminate.

`Schema.Union` derives an unbounded arbitrary, so a union that recurses through a non-array field can overflow the stack while generating a single sample. `boundedUnion(identifier, { base, recur })` splits the members into leaves and recursive arms, caps generation depth, and changes nothing else — decoding, encoding and equivalence remain `Schema.Union`'s.

The identifier is both the schema's `identifier` and the depth budget the generator counts against, so keep it unique per recursive cycle.

Previously part of `@systemfsoftware/effect-schema-law`.
