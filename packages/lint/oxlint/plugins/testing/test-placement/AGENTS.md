# AGENTS.md — `@systemfsoftware/oxlint-plugin-test-placement`

Shared conventions: `packages/lint/oxlint/plugins/AGENTS.md`. Rules enforcing where tests may live and which test suffixes are sanctioned; delivered through `@systemfsoftware/oxlint-config/base` via the `effect-dmmf` bundle. `tests-import-public-api` binds every file under the package-root `tests/` or `__tests__/` trees, regardless of basename.

## Rules

| ID | Rule | Gate |
| --- | --- | --- |
| **TP1** | Severity changes go in `packages/lint/oxlint/config/src/oxlint-config.strict.ts`; never a dedicated test-placement preset. | `test ! -e packages/lint/oxlint/config/src/oxlint-config.test-placement.ts` exits 0; no `./test-placement` entry in `packages/lint/oxlint/config/package.json` |
| **TP2** | This package's own RuleTester suites stay in `src/rules/__tests__/`; never add an `oxlint.config.ts` here. | `test ! -e packages/lint/oxlint/plugins/testing/test-placement/oxlint.config.ts` exits 0 |
| **TP3** | Placement lives in exactly one plugin: keep every test-location ruling here; never re-add a location branch to another plugin. | `grep -rn 'wrongLocation' packages --include='*.ts' \| grep -v 'packages/lint/oxlint/plugins/testing/test-placement/'` returns no hits |
| **TP4** | `*.schema.test.ts` is forbidden; a schema's round-trip coverage belongs to the generated `src/schema-laws.test.ts`. Never re-admit the suffix or whitelist a second test basename. | `grep -rn 'SCHEMA_SUFFIX' packages/lint/oxlint/plugins/testing/test-placement/src` hits only `path.config.ts` and `no-test-file-in-src.ts`; `=== SCHEMA_LAWS_BASENAME` appears only in the single exact-basename allowance |
| **TP5** | One behaviour suffix — `*.integration.test.ts` — whether or not the test doubles at a port; never re-introduce `*.composition.test.ts` or `*.feature.test.ts`. Reach for delete before naming a test whose assertion restates a pure-cell literal, and keep deletion reachable in every emitted `Fix:`. | `grep -rn -e '\.composition\.test\.ts' -e '\.feature\.test\.ts' packages/lint/oxlint/plugins/testing/test-placement/src` hits only the retired-suffix rejection suite; `basename.endsWith(INTEGRATION_SUFFIX)` is the sole admission in `test-suffix-outside-src.ts`; `grep -rn 'delete' src/rules/*.config.ts` returns hits in the `Fix` strings |
| **TP6** | `src-property-test-cell`'s `missingCellTest` arm is this package's OX-OB1 obligation — it fires on the ABSENCE of an in-source vitest block for a declared cell, reading only the linted file's AST (OX-TS2). | `grep -rn -e 'missingCellTest' -e 'Should_Report_When_DeclaredCellHasNoColocatedTestAndNoInSourceBlock' -e 'Should_StaySilent_When_NoCellsAreDeclared' src` returns hits for the messageId and both suite cases |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-test-placement typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test
pnpm --filter @systemfsoftware/oxlint-plugin-test-placement lint
```
