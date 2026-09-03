# AGENTS.md — `@systemfsoftware/effect-memfs`

In-memory filesystem: the `@effect/platform` FileSystem port backed by the `memfs` driver. Root `AGENTS.md` governs.

## Rules

| ID      | Rule                                                                                                                                                                                                                               | Gate                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **MF1** | Narrow driver values with runtime-checked type predicates that throw on mismatch, inside the `Effect.tryPromise` that already maps failures to `PlatformError` — never `as`, `as unknown as`, or an options-laundering `as never`. | `pnpm --filter @systemfsoftware/effect-memfs lint` exits 0 with zero `adapter-no-cast` reports                |
| **MF2** | Exactly one driver (`memfs`) behind the FileSystem port; never import a second external system into `memory-file-system.adapter.ts`.                                                                                               | `pnpm --filter @systemfsoftware/effect-memfs lint` exits 0 with zero `adapter-single-external-system` reports |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-memfs typecheck
pnpm --filter @systemfsoftware/effect-memfs test
pnpm --filter @systemfsoftware/effect-memfs lint
```
