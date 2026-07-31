# AGENTS.md — `@systemfsoftware/effect-schema-vite`

> **Location:** `packages/effect-schema-vite/` — Vite plugin that auto-discovers Effect Schema exports and injects `ruleOfSchemas` property tests. Root `AGENTS.md` governs; this file carries only `effect-schema-vite/`-specific deltas.

Exports `inlineSchemaTests` — a Vite plugin that walks the consumer's `src/`, finds every exported Effect `Schema`, and generates inline `ruleOfSchemas` tests. It serves them at `virtual:@systemfsoftware/schema-laws`; a consumer imports that module from exactly one file, `src/schema-laws.test.ts` — the only test filename `@systemfsoftware/oxlint-plugin-test-placement` whitelists by name.

```yaml
- id: V1
  title: Hand-written codec-law properties are forbidden in consumers
  do: rely on the injected law tests for round-trip identity and encode stability of every exported schema; reserve hand-written property tests for domain invariants
  dont: hand-write it.prop cases re-asserting decode∘encode identity or S.equivalence roundtrips for a schema the plugin already covers
  harm: a hand-written law test duplicates the injected one and drifts — two sources of truth for the same law
  check: grep finds no hand-written S.equivalence roundtrip it.prop in a consumer's *.test.ts
```

| Check | Command                                                       |
| ----- | ------------------------------------------------------------- |
| Types | `pnpm --filter @systemfsoftware/effect-schema-vite typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-vite test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-vite lint`      |
