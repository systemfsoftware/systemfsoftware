# AGENTS.md — `@systemfsoftware/oxlint-make-boundary`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. This package is not a plugin: no rules, no RuleTester suites, no enrollment in any preset.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                                                                                    | Gate                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **MB1** | Single home: no plugin or package vendors a copy of `MakeBoundary.ts`.                                                                                                                                                                                                                                                                                                  | `git ls-files '*MakeBoundary.ts'` returns exactly this package's entry                |
| **MB2** | Never a runtime dependency of a plugin: consumers declare it under `devDependencies` and bundle it into their dist; plugins never depend on plugins.                                                                                                                                                                                                                    | `review` — consumer manifests and dist artifacts                                      |
| **MB3** | The boundary locator stays workflow-specific: `WORKFLOW_SOURCE`, `WORKFLOW_IMPORT_NAME`, and `MAKE_MEMBER_NAME` are declared here (the stryker-plugins workflow-make-ignorer cannot be imported from the oxlint side); origin verdicts for other vocabularies live in their own consumers.                                                                              | `review` — the module's imports and the three declared constants                      |
| **MB4** | Behavior is graded through consumers' RuleTester suites. This package deliberately carries no tests and no `stryker.config.json` — a config over a test-less package would fail CI mutation vacuously, and per-module unit tests would restate the suites. The tradeoff: the locator's internals have no direct mutation enrollment; the consumers' suites are the net. | `test ! -e stryker.config.json && ! test -d src/__tests__ && ! test -d tests` exits 0 |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-make-boundary typecheck
pnpm --filter @systemfsoftware/oxlint-make-boundary build
pnpm --filter @systemfsoftware/oxlint-make-boundary lint
```
