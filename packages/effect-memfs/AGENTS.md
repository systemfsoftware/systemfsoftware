# AGENTS.md — `@systemfsoftware/effect-memfs`

In-memory filesystem: the `@effect/platform` FileSystem port backed by the `memfs` driver. Root `AGENTS.md` governs.

## Rules

| ID      | Rule                                                                                                                                                                                                | Gate                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **MF1** | Narrow driver values with the runtime predicates in `src/driver-values.ts`, which refuse a mismatch as a `ShapeRefusal`; never a type assertion.                                                    | `pnpm --filter @systemfsoftware/effect-memfs lint` exits 0 with zero `typescript(consistent-type-assertions)` reports                          |
| **MF2** | Exactly one driver (`memfs`) behind the FileSystem port, imported only by `src/memory-file-system.handle.ts`; no Node builtin and no second external system reaches the handles or `driver-values`. | Node builtins: `lint` exits 0 with zero `eslint(no-restricted-imports)` and `effecttsgo(node-builtin-import)` reports. Second driver: `review` |

MF2 review pair — wrong: `src/driver-values.ts` imports `memfs` to test `instanceof Dirent`. Right: `driver-values.ts` narrows with `Predicate.hasProperty` over the value the handle hands it.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-memfs typecheck
pnpm --filter @systemfsoftware/effect-memfs test
pnpm --filter @systemfsoftware/effect-memfs lint
```
