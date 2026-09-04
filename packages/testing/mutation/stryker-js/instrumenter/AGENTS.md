# AGENTS.md — `@systemfsoftware/stryker-js-instrumenter`

Places mutants and coverage hooks for every mutation run in this workspace: oxc parses, an owned ESTree printer renders. Parent: `packages/testing/mutation/stryker-js/AGENTS.md`.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                                                                          | Gate                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **IN1** | No Babel anywhere in the graph and no `plugins` option on the instrumenter surface.                                                                                                                                                                                                                                                                           | `git grep -in babel -- src/` prints zero lines                          |
| **IN2** | Printer changes ride the instrument characterization suite: printed output is exercised through the public `instrument` entry (`tests/instrumenter.integration.test.ts` — comments and hashbang survival among the scenarios). The printer has no direct unit net of its own, so a printer change the characterization suite cannot observe ships unreviewed. | `pnpm --filter @systemfsoftware/stryker-js-instrumenter test`           |
| **IN3** | `tsc --noEmit` and `oxlint` report zero; where the type system cannot express a constructed AST shape, a file-scoped oxlint disable carries its reason at the top of the file — scoped, and the reason true.                                                                                                                                                  | `pnpm --filter @systemfsoftware/stryker-js-instrumenter typecheck lint` |
| **IN4** | Placers validate their own fit in `canPlace`; never restore a generic applied-node return.                                                                                                                                                                                                                                                                    | `review`                                                                |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-instrumenter build
pnpm --filter @systemfsoftware/stryker-js-instrumenter typecheck
pnpm --filter @systemfsoftware/stryker-js-instrumenter lint
pnpm --filter @systemfsoftware/stryker-js-instrumenter attw
```
