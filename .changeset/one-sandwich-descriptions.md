---
"@systemfsoftware/effect-cell-types": major
"@systemfsoftware/stryker-js-platform-node": none
---

A `Cell` description is now exactly one sandwich: read, decode, decide, encode, write. The `layers` member and the `Layer` type are deleted, `Cell.read` no longer accepts a `previous` argument, and `Cell.apply` runs that single fold; multi-layer replay no longer exists.

`Cell.layer(spec)` is new: the same description built from one object. `{ read, decide, write }` composes with identity decode and encode; `{ read, decode, decide, encode, write }` is the full form. A spec with only one of decode/encode, or a short-form write that cannot receive the decide outcome, is a compile error.

Migrating: two layers become two descriptions applied in sequence in the calling `Effect.gen`; a write already receives the read's value as its second parameter.
