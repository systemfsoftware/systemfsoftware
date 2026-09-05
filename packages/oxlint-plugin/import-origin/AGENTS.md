# AGENTS.md — `@systemfsoftware/oxlint-import-origin`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. This package is not a plugin: no rules, no RuleTester suites, no enrollment in any preset.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                                                                                  | Gate                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **IO1** | Single home: no plugin or package vendors a copy of `ImportOrigin.ts`.                                                                                                                                                                                                                                                                                                | `git ls-files '*ImportOrigin.ts'` returns exactly this package's entry                |
| **IO2** | Never a runtime dependency of a plugin: consumers declare it under `devDependencies` and bundle it into their dist.                                                                                                                                                                                                                                                   | `review` — consumer manifests and dist artifacts                                      |
| **IO3** | The resolver stays self-contained: it imports nothing from any rule, plugin, or `MakeBoundary` — origin resolution is vocabulary-agnostic (schema/workflow verdicts live in the consumers).                                                                                                                                                                           | `review`                                                                              |
| **IO4** | Behavior is graded through consumers' RuleTester suites. This package deliberately carries no tests and no `stryker.config.json` — a config over a test-less package would fail CI mutation vacuously, and per-file kernel unit tests would restate the suites. The tradeoff: kernel internals have no direct mutation enrollment; the consumers' suites are the net. | `test ! -e stryker.config.json && ! test -d src/__tests__ && ! test -d tests` exits 0 |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-import-origin typecheck
pnpm --filter @systemfsoftware/oxlint-import-origin build
pnpm --filter @systemfsoftware/oxlint-import-origin lint
```
