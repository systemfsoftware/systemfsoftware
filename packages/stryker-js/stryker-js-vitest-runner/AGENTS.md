# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

Vitest test-runner plugin for Stryker. Parent: `packages/stryker-js/AGENTS.md`.

## Rules

| ID      | Rule                                                                    | Gate                                                                |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **VR1** | The sandbox directory is the project root.                              | `review`                                                            |
| **VR2** | This adapter currently has no test net.                                 | `review`                                                            |
| **VR3** | `src/stryker-setup.ts` imports nothing local.                           | `grep -n "^import" src/stryker-setup.ts` shows no relative imports  |
| **VR4** | Source carries no type-suppression comments and no non-null assertions. | `pnpm --filter @systemfsoftware/stryker-js-vitest-runner typecheck` |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-vitest-runner build
pnpm --filter @systemfsoftware/stryker-js-vitest-runner typecheck
pnpm --filter @systemfsoftware/stryker-js-vitest-runner lint
```
