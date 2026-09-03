# AGENTS.md — `@systemfsoftware/stryker-js`

The mutation-testing language: enumerated concept modules, no platform. Parent: `packages/testing/mutation/stryker-js/AGENTS.md`.

## Rules

| ID      | Rule                                                                                                                                            | Gate                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **SL1** | Public specifiers are enumerated in `tsdown.config.ts` (REPO-S4): no wildcard, no `internal` specifier, never hand-edit `package.json#exports`. | `pnpm --filter @systemfsoftware/stryker-js build` regenerates cleanly |
| **SL2** | A plugin is a `Layer` via `declarePlugin` on `./Plugin`; `SandboxDirectory` is a service, never `process.cwd()`.                                | `review`                                                              |
| **SL3** | The option set is one Effect Schema on `./Schema`; the base preset is that entry's default export.                                              | `review`                                                              |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js build
pnpm --filter @systemfsoftware/stryker-js typecheck
pnpm --filter @systemfsoftware/stryker-js test
pnpm --filter @systemfsoftware/stryker-js lint
```
