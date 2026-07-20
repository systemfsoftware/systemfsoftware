# AGENTS.md — `@systemfsoftware/effect-schema-vite`

> **Location:** `packages/effect-schema-vite/` — Vite plugin that auto-discovers Effect Schema exports and injects `ruleOfSchemas` property tests. Root `AGENTS.md` governs; this file carries only `effect-schema-vite/`-specific deltas.

Exports `inlineSchemaTests` — a Vite plugin that walks the consumer's `src/`, finds every exported Effect `Schema`, and generates inline `ruleOfSchemas` tests.

| Check | Command                                                       |
| ----- | ------------------------------------------------------------- |
| Types | `pnpm --filter @systemfsoftware/effect-schema-vite typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-vite test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-vite lint`      |
