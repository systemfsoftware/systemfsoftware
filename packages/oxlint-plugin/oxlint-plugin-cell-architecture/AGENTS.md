# AGENTS.md — `@systemfsoftware/oxlint-plugin-cell-architecture`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. Rules here enforce Cell Architecture contracts (cell boundary isolation, tag discipline, internal JSDoc export discipline).

## Rules

| ID      | Rule                                                                                                                                   | Gate                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **CA1** | Every cell architecture rule must provide a paired static config (`src/rules/<name>.config.ts`) separate from its rule implementation. | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture build`    |
| **CA2** | Rules in this plugin must have 100% mutation coverage under Stryker; no Surviving mutants.                                             | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture mutation` |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture test
pnpm --filter @systemfsoftware/oxlint-plugin-cell-architecture lint
```
