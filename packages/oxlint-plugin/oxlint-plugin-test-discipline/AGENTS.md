# AGENTS.md — `@systemfsoftware/oxlint-plugin-test-placement`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. Rules enforcing where tests may live and which test suffixes are sanctioned; delivered through `@systemfsoftware/oxlint-config/base` via the `effect-dmmf` bundle.

## Rules

| ID      | Rule                                                                                                                                | Gate                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TP1** | Severity changes go in `packages/oxlint-plugin/oxlint-config/src/oxlint-config.strict.ts`; never a dedicated test-placement preset. | `test ! -e packages/oxlint-plugin/oxlint-config/src/oxlint-config.test-placement.ts` exits 0                                                                    |
| **TP2** | This package's own RuleTester suites stay in `src/rules/__tests__/`; never add an `oxlint.config.ts` here.                          | `test ! -e packages/oxlint-plugin/oxlint-plugin-test-placement/oxlint.config.ts` exits 0                                                                        |
| **TP3** | Placement lives in exactly one plugin.                                                                                              | `grep -rn 'wrongLocation' packages/oxlint-plugin --include='*.ts' \| grep -v 'oxlint-plugin-test-placement/'` returns no hits                                   |
| **TP4** | `*.schema.test.ts` is forbidden.                                                                                                    | `grep -rn 'SCHEMA_SUFFIX' packages/oxlint-plugin/oxlint-plugin-test-placement/src` hits only the config files                                                   |
| **TP5** | One behaviour suffix — `*.integration.test.ts`.                                                                                     | `grep -rn -e '.composition.test.ts' -e '.feature.test.ts' packages/oxlint-plugin/oxlint-plugin-test-placement/src` hits only the retired-suffix rejection suite |
| **TP6** | `src-property-test-cell`'s `missingCellTest` arm is this package's OX-OB1 obligation.                                               | `grep -rn 'missingCellTest' src` returns hits for the messageId and both suite cases                                                                            |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-test-placement typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-test-placement test
pnpm --filter @systemfsoftware/oxlint-plugin-test-placement lint
```
