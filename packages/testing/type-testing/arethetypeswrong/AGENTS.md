# @systemfsoftware/arethetypeswrong-cli + @systemfsoftware/arethetypeswrong

> **Location:** `packages/testing/type-testing/arethetypeswrong/` — the arethetypeswrong tooling (the checker behind arethetypeswrong.github.io), owned and published under this org, governing `cli`, `analysis` and `recipes`. Root `AGENTS.md` governs; this file carries only the leaf delta.

## Delta

- Keep `prepack: pnpm build` and `prepare: tsdown` — both build gitignored `dist/` needed for publish/bin
- These are TOOLING — don't add cell lint or mutation gates
- The analyser stays on `catalog:attw` (TS 6 bridge) — don't move to TS 7 without verifying it still builds
- The in-memory package tree lives in `@systemfsoftware/npm-package`, outside this subtree — it carries no `typescript` dependency, so a change needing the compiler belongs in `analysis`, never there
