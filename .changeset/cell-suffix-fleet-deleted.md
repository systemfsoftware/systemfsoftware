---
"@systemfsoftware/oxlint-plugin-cell-imports": major
"@systemfsoftware/oxlint-plugin-cell-taxonomy": major
"@systemfsoftware/oxlint-plugin-effect-acl": major
"@systemfsoftware/oxlint-plugin-effect-adapter": major
"@systemfsoftware/oxlint-plugin-effect-executor": major
"@systemfsoftware/oxlint-plugin-effect-handler": major
"@systemfsoftware/oxlint-plugin-effect-kernel": major
"@systemfsoftware/oxlint-plugin-effect-middleware": major
"@systemfsoftware/oxlint-plugin-effect-observer": major
"@systemfsoftware/oxlint-plugin-effect-policy": major
"@systemfsoftware/oxlint-plugin-effect-shape": major
"@systemfsoftware/oxlint-plugin-effect-state": major
"@systemfsoftware/oxlint-plugin-effect-store": major
---

The cell-role suffix rule fleet is deleted, whole packages and all.

Thirteen plugin packages keyed on the sanctioned cell-role suffixes (`acl`, `adapter`, `executor`,
`handler`, `kernel`, `middleware`, `observer`, `policy`, `schema`, `shape`, `state`, `store`,
`workflow`) are gone, along with `effect-workflow`'s four suffix-gated rules and `effect-schema`'s
`schema-exports-only-schemas` and `no-manual-tag-member`. Every representative violation of a
deleted class compiles clean under strict after the deletion — the refusing channel is none,
recorded unowned in `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md`.
What replaced the suffix is the `Workflow.make` boundary: the brand forces the constructor, the
lint keys on it, the ignorer selects the mutation population from it.

`effect-entrypoint` survives (its rules gate on the `main.ts` basename the taxonomy never owned),
as do `cell-vocabulary`, `test-placement`, `test-hygiene`, `property-testing`, and core's
non-filename rules.
