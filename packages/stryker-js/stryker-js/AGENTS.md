# AGENTS.md — `@systemfsoftware/stryker-js`

The mutation-testing language: enumerated concept modules, no platform. Parent: `packages/stryker-js/AGENTS.md`.

## Rules

| ID      | Rule                                                              | Gate                                                                  |
| ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| **SL1** | Public specifiers are enumerated in `tsdown.config.ts` (REPO-S4). | `pnpm --filter @systemfsoftware/stryker-js build` regenerates cleanly |
| **SL2** | A plugin is a `Layer` via `declarePlugin` on `./Plugin`.          | `review`                                                              |
| **SL3** | The option set is one Effect Schema on `./Schema`.                | `review`                                                              |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js build
pnpm --filter @systemfsoftware/stryker-js typecheck
pnpm --filter @systemfsoftware/stryker-js test
pnpm --filter @systemfsoftware/stryker-js lint
```
