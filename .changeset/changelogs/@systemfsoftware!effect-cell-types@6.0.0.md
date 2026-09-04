## 6.0.0

### Major Changes

- Cell is one sandwich: build it with `Cell.layer` and run it with `Cell.run`.

  `Cell.apply` and the chained phase constructors (`Cell.read`, `Cell.decode`, `Cell.decide`, `Cell.encode`, `Cell.write`) are removed. `Cell.layer` takes one spec object — `{ read, decide, write }` rules on what the read produced, or add `decode` and `encode` together to adapt both sides of the decision.

  Phase bodies that `yield*` a service publish it on the Cell's requirements channel; provide once with `Cell.provide` or `Effect.provide`. A missing provide is a compile error at the run site.

  New arrows: `map`, `mapInput`, `andThen`, `zip`, `provide`, `withPolicy`. A refused decision reaches your write as the outcome value — only read, decode, and write failures fail the effect. The vocabulary drops `applier`.

  `Cell.canonical`, `CanonicalCommand`, `canonicalDecide`, `PhaseFact`, and the vocabulary's `phases` list and `byKind.impure` partition are removed: the vocabulary is a const table (`module`, `ioCells`, `byKind.pure`, `composer`) and `PhaseName` is now exported. Nothing else read the walked surface; a rule that wants order reads the interpreter, not the table.

- A `Cell` description is now exactly one sandwich: read, decode, decide, encode, write. The `layers` member and the `Layer` type are deleted, `Cell.read` no longer accepts a `previous` argument, and `Cell.apply` runs that single fold; multi-layer replay no longer exists.

  `Cell.layer(spec)` is new: the same description built from one object. `{ read, decide, write }` composes with identity decode and encode; `{ read, decode, decide, encode, write }` is the full form. A spec with only one of decode/encode, or a short-form write that cannot receive the decide outcome, is a compile error.

  The walked vocabulary now names its composing constructor as `Cell.vocabulary.composer`, alongside `applier`.

  Migrating: two layers become two descriptions applied in sequence in the calling `Effect.gen`; a write already receives the read's value as its second parameter.

- Workflow.make now requires the success channel to be a tagged union of at least two schema tagged classes sharing one family TypeId; single-variant, untagged, and unshared-brand decisions are compile errors naming the defect
