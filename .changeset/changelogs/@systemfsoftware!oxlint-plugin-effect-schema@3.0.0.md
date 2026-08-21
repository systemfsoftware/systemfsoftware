## 3.0.0

### Major Changes

- The cell-role suffix rule fleet is deleted, and the aggregate shrinks with it.

  The thirteen plugin packages keyed on the sanctioned cell-role suffixes (`acl`, `adapter`,
  `executor`, `handler`, `kernel`, `middleware`, `observer`, `policy`, `schema`, `shape`, `state`,
  `store`, `workflow`) are gone, so `effect-dmmf` — the aggregate every cell diagnostic is reported
  under — loses those members wholesale, and `effect-schema` loses `schema-exports-only-schemas` and
  `no-manual-tag-member` (`.schema.ts` and `.shape.ts` are in the sanctioned vocabulary). Also gone:
  `effect-workflow`'s four suffix-gated rules. Every representative violation of a deleted class
  compiles clean under strict after the deletion — the refusing channel is none, recorded unowned in
  `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md`. What replaced the
  suffix is the `Workflow.make` boundary: the brand forces the constructor, the lint keys on it, the
  ignorer selects the mutation population from it.

  The thirteen deleted package names should be `npm deprecate`d at publish time (the packages are
  removed from the workspace; their last published versions keep working for existing installs).

  `effect-entrypoint` survives (its rules gate on the `main.ts` basename the taxonomy never owned),
  as do `cell-vocabulary`, `test-placement`, `test-hygiene`, `property-testing`, and core's
  non-filename rules.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

- Three new rules, a retargeted test-placement taxonomy, and one removal.

  `make-file-location` allows a workflow constructor only in the workflow module that owns it, at most once per module.

  `schema-declaration-location` requires a schema declaration to live in a schema module, or the workflow module that owns it. A binding whose initializer returns something other than a schema — a type guard, a decoder, an encoder, an arbitrary — is a use and is not reported.

  `test-placement` narrows which tests may sit beside source, requires every other test to live in the package test directory, and adds `tests-dir-helpers-in-fixtures`. It also removes `in-source-test-targets-private`, which `effect-dmmf` no longer re-exports — drop the entry if you set it. Each rule reports the exact shape it expects.

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Rescope three rules that over-rejected legitimate files.

  Each was a measured false positive, not a theoretical one — all three fired on files written in the
  course of shipping `Workflow.make`:

  - `cell-suffix-required` rejected `src/Workflow.ts`, a PascalCase contract module whose basename names
    no cell because it _is_ the package's published contract. It now exempts that shape.
  - `no-manual-tag-member`, `no-direct-tag-access`, and `ban-data-taggederror` rejected `**/*.tst.ts`
    type-test fixtures, which must contain no runtime values and therefore cannot use
    `S.TaggedStruct`. The fix each rule suggested was impossible in the file it was suggesting it for.

  This is the cost the cell-taxonomy derivation already prices: a depth-0 rule cannot miss its target, but
  its predicate is a proxy for the property actually wanted, so it over-rejects — and that cost is meant
  to be priced per rule rather than waved away. Three rules, three over-rejections, all rescoped by
  narrowing the predicate; none was deleted and no config was weakened.
