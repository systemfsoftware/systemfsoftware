# AGENTS.md — `cell-taxonomy/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

This package mechanizes the positive half of Constitution IV.2 — a source file must carry a suffix a rule keys on. The negative half (banned layer and junk-drawer path segments) is not implemented anywhere yet.

```yaml
- id: CT1
  title: Non-test filenames only
  do: skip every test artifact - a *.test.ts / *.spec.ts basename, and anything under tests/ or __tests__/
  dont: rule on where a test file may live or which test suffix is sanctioned
  harm: test placement belongs to @systemfsoftware/oxlint-plugin-test-placement under its TP3, and two packages ruling on it is the live contradiction TP3 exists to prevent
  check: every test-shaped filename is a valid case in this package's RuleTester suite

- id: CT2
  title: The default lists are defaults, not law
  do: extend a project's sanctioned names through the `cells` and `exempt` options
  dont: add a project-specific suffix to CELLS in cell-suffix-required.config.ts
  harm: the taxonomy skill files the positive naming match as project-relative and unmechanizable without the project's own vocabulary - baking one project's nouns into the published default makes the plugin wrong everywhere else
  check: CELLS holds only cells the general theory names; anything else arrives as an option

- id: CT3
  title: Filename in, decision out - never file content
  do: key the rule on context.filename alone
  dont: read the AST, imports, or exports to decide whether a name is sanctioned
  harm: content rules co-vary with the stack they inspect; this package co-varies only with the taxonomy, and mixing the two axes is what made core a junk drawer
  check: the rule's only visitor is Program, used solely to carry the report node

- id: CT4
  title: Generated files are exempt from the suffix
  do: exempt any src/ file whose segment immediately before the extension is `generated` - foo.generated.ts and order.schema.generated.ts
  dont: exempt a bare generated.ts - there the marker is the whole basename, not a suffix marker - or a generated segment anywhere but directly before the extension
  harm: a generated artifact cannot be renamed to name a cell, so a rule demanding the rename is unsatisfiable and every build ships an unfixable violation
  check: the RuleTester suite pairs valid *.generated.ts cases with invalid near-misses (generated.ts, foo.generated.helper.ts)
```

| Check    | Command                                                                |
| -------- | ---------------------------------------------------------------------- |
| Types    | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy typecheck` |
| Test     | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy test`      |
| Mutation | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy mutation`  |
