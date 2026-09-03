# AGENTS.md — `@systemfsoftware/stryker-plugins`

Stryker plugins for Effect-TS: ignores proven-equivalent mutants on Schema declarations (brands, `TaggedClass`/`TaggedError` tags). Root `AGENTS.md` governs.

## Rules

| ID      | Rule                                                                                              | Gate                                                  |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **SP1** | An ignored mutant is proven-equivalent: mutating the tag/brand field produces identical behavior. | `pnpm --filter @systemfsoftware/stryker-plugins test` |
| **SP2** | Every new ignore pattern arrives with a test demonstrating the equivalent mutant.                 | `pnpm --filter @systemfsoftware/stryker-plugins test` |
| **SP3** | Hook into Stryker's `resolveMutant` pipeline only; never bypass other mutation stages.            | `review`                                              |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-plugins typecheck
pnpm --filter @systemfsoftware/stryker-plugins test
pnpm --filter @systemfsoftware/stryker-plugins lint
```
