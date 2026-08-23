# @systemfsoftware/arethetypeswrong-cli + @systemfsoftware/arethetypeswrong-core

> **Location:** `packages/arethetypeswrong/` — the arethetypeswrong tooling (the checker behind arethetypeswrong.github.io), owned and published under this org, governing `cli` and `core`. Root `AGENTS.md` governs; this file carries only the leaf delta.

## Delta

- Keep `prepack: pnpm build` and `prepare: tsdown` — both build gitignored `dist/` needed for publish/bin
- These are TOOLING — don't add cell lint or mutation gates
- Core stays on `catalog:attw` (TS 6 bridge) — don't move to TS 7 without verifying it still builds
