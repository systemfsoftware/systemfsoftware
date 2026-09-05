# AGENTS.md — `@systemfsoftware/stryker-js-instrumenter`

Places mutants and coverage hooks for every mutation run in this workspace: oxc parses, an owned ESTree printer renders. Parent: `packages/stryker-js/AGENTS.md`.

## Rules

| ID      | Rule                                                                                | Gate                                                                    |
| ------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **IN1** | No Babel anywhere in the graph and no `plugins` option on the instrumenter surface. | `git grep -in babel -- src/` prints zero lines                          |
| **IN2** | Printer changes ride the instrument characterization suite.                         | `pnpm --filter @systemfsoftware/stryker-js-instrumenter test`           |
| **IN3** | `tsc --noEmit` and `oxlint` report zero.                                            | `pnpm --filter @systemfsoftware/stryker-js-instrumenter typecheck lint` |
| **IN4** | Placers validate their own fit in `canPlace`.                                       | `review`                                                                |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-instrumenter build
pnpm --filter @systemfsoftware/stryker-js-instrumenter typecheck
pnpm --filter @systemfsoftware/stryker-js-instrumenter lint
pnpm --filter @systemfsoftware/stryker-js-instrumenter attw
```
