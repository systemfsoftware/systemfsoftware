# AGENTS.md — `effect-schema/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

This package owns rules for the Effect Schema cell. It exists because those rules were living in `core`, which is a junk drawer under Constitution IV.2; `ban-effect-schema-imports`, `ban-data-taggederror` and `no-manual-tag-property` moved here as the first slice of dismantling it.

```yaml
- id: ES1
  title: Schema rules co-vary with the schema stack, not with the linter
  do: add a rule here when it changes as Effect Schema or the generated-law stack changes
  dont: add it to core, or to test-placement, or to property-testing
  harm: core is the junk drawer this package is dismantling; test-placement rules on filenames only and property-testing rules on property-test mechanics — a schema rule in either mixes two axes of change in one package
  check: review — every rule here would need editing if `ruleOfSchemas` gained or lost a law, or if Effect's Schema API changed; the reviewer confirms each rule keys on the Schema or generated-law API, not on linter mechanics

- id: ES2
  title: Placement is not this package's concern
  do: let `@systemfsoftware/oxlint-plugin-test-placement` decide which filenames may exist where
  dont: key any rule here on where a file lives, beyond the suffix that identifies the artifact being linted
  harm: two packages ruling on placement is the live contradiction TP3 was written to prevent
  check: review — no rule here reports on a directory, only on file content; the reviewer confirms every context.report targets an AST node in the linted file, never the file's location
```

- Types: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema typecheck`
- Test: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test`
