---
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
"@systemfsoftware/oxlint-plugin-effect-schema": major
---

The cell-role suffix rule fleet is deleted, and the aggregate shrinks with it.

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
