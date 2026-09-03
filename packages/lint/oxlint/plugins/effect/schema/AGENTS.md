# AGENTS.md — `@systemfsoftware/oxlint-plugin-effect-schema`

Shared conventions: `packages/lint/oxlint/plugins/AGENTS.md`. Owns the Effect Schema rules (`ban-effect-schema-imports`, `ban-data-taggederror`, `no-manual-tag-property`).

## Rules

| ID      | Rule                                                                                                                                                                                                 | Gate                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **ES1** | Schema rules co-vary with the schema stack: a rule belongs here only if it changes when Effect Schema or the generated-law stack changes — never in `core`, `test-placement`, or `property-testing`. | `review` — each rule keys on the Schema or generated-law API, not linter mechanics |
| **ES2** | Placement is not this package's concern: `@systemfsoftware/oxlint-plugin-test-placement` decides which filenames may exist where; no rule here reports on a file's location.                         | `review` — every `context.report` targets an AST node in the linted file           |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema lint
```
