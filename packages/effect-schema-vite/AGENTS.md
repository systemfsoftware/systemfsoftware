# AGENTS.md — `@systemfsoftware/effect-schema-vite`

> **Location:** `packages/effect-schema-vite/` — Vite plugin that auto-discovers Effect Schema exports and injects `ruleOfSchemas` property tests. Root `AGENTS.md` governs; this file carries only `effect-schema-vite/`-specific deltas.

Exports `inlineSchemaTests` — a Vite plugin that walks the consumer's `src/`, finds every exported Effect `Schema`, and generates `ruleOfSchemas` tests. It injects them by rewriting the consumer's own `src/schema-laws.test.ts` through the `transform` hook: a real file on disk, never a virtual module, because a virtual id has no path for vitest's related-file walk to resolve and every generated law would be silently dropped from `--related` runs. That basename is the only test filename `@systemfsoftware/oxlint-plugin-test-placement` whitelists by name.

```yaml
- id: VITE-V1
  title: Hand-written codec-law properties are forbidden in consumers
  do: rely on the injected law tests for round-trip identity and encode stability of every exported schema; reserve hand-written property tests for domain invariants
  dont: hand-write it.prop cases re-asserting decode∘encode identity or S.equivalence roundtrips for a schema the plugin already covers
  harm: a hand-written law test duplicates the injected one and drifts — two sources of truth for the same law
  check: `grep -rnE 'S\.equivalence' packages/effect-daemon-spec/src packages/hex-schema/src` returns nothing — no hand-written S.equivalence roundtrip it.prop in a consumer *.test.ts
```

| Check | Command                                                       |
| ----- | ------------------------------------------------------------- |
| Types | `pnpm --filter @systemfsoftware/effect-schema-vite typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-vite test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-vite lint`      |
