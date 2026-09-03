# AGENTS.md — `@systemfsoftware/arethetypeswrong-cli` + `@systemfsoftware/arethetypeswrong`

The arethetypeswrong tooling (governing `cli`, `analysis`, `recipes`). Root `AGENTS.md` governs; this file carries only the leaf delta.

## Rules

| ID      | Rule                                                                                                                                                             | Gate                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **AW1** | Keep `prepack: pnpm build` and `prepare: tsdown` — both build the gitignored `dist/` that publish and the bin need (same pnpm bin-linking constraint as CLI-B1). | Fresh `pnpm install` then `pnpm --filter @systemfsoftware/arethetypeswrong-cli exec attw --help` exits 0 |
| **AW2** | TOOLING: no cell lint rules, no mutation gates.                                                                                                                  | `review`                                                                                                 |
| **AW3** | The analyser stays on `catalog:attw` (TS 6 bridge) — do not move to TS 7 without verifying it still builds.                                                      | `pnpm --filter @systemfsoftware/arethetypeswrong build`                                                  |
| **AW4** | `@systemfsoftware/npm-package` (outside this subtree) carries no `typescript` dependency — a change needing the compiler belongs in `analysis`, never there.     | `review`                                                                                                 |

## Verification

```bash
pnpm --filter @systemfsoftware/arethetypeswrong typecheck && pnpm --filter @systemfsoftware/arethetypeswrong lint
pnpm --filter @systemfsoftware/arethetypeswrong-cli typecheck && pnpm --filter @systemfsoftware/arethetypeswrong-cli lint
```
