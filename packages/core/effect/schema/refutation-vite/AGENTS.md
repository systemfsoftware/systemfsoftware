# AGENTS.md — `@systemfsoftware/effect-schema-refutation-vite`

> **Location:** `packages/core/effect/schema/refutation-vite/` — Vite plugin that asserts every obligation reachable from an exported Effect Schema is refuted.

Exports `inlineRefutationCoverage` — a Vite plugin that walks the consumer's `src/`, finds every exported Effect `Schema`, and generates an obligation-coverage suite. It rewrites the consumer's own `src/schema-refutations.test.ts` through the `transform` hook: a real file on disk, never a virtual module, so vitest's related-file walk reaches the schemas. That basename and `schema-laws.test.ts` are the only test filenames `@systemfsoftware/oxlint-plugin-test-placement` whitelists by name in `src/`.

Install alongside `@systemfsoftware/effect-schema-vite` — the two plugins write different files (`schema-laws.test.ts` for round-trip laws, `schema-refutations.test.ts` for coverage); two plugins rewriting one path would collide.

```yaml
- id: REF-VITE-1
  title: Coverage plugin owns schema-refutations.test.ts alone
  do: rely on inlineRefutationCoverage to assert that every obligation reachable from an exported schema is refuted somewhere; pair it with inlineSchemaTests for round-trip laws
  dont: hand-write a coverage assertion or add a second generator for the same basename
  harm: two writers for one path collide and one suite is lost; a hand-written assertion drifts from the generated obligationsOf set
  check: pnpm --filter @systemfsoftware/effect-schema-refutation-vite test
```

| Check | Command                                                                  |
| ----- | ------------------------------------------------------------------------ |
| Types | `pnpm --filter @systemfsoftware/effect-schema-refutation-vite typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-refutation-vite test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-refutation-vite lint`      |
