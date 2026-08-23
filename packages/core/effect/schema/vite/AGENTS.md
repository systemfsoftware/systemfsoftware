# AGENTS.md — `@systemfsoftware/effect-schema-vite`

> **Location:** `packages/core/effect/schema/vite/` — Vite plugin that auto-discovers Effect Schema exports and injects `ruleOfSchemas` property tests.

Exports `inlineSchemaTests` — a Vite plugin that walks the consumer's `src/`, finds every exported Effect `Schema`, and generates `ruleOfSchemas` tests. It injects them by rewriting the consumer's own `src/schema-laws.test.ts` through the `transform` hook: a real file on disk, never a virtual module, because a virtual id has no path for vitest's related-file walk to resolve and every generated law would be silently dropped from `--related` runs. That basename is the only test filename `@systemfsoftware/oxlint-plugin-test-placement` whitelists by name. Obligation-coverage is opt-in via `InlineSchemaTestsOptions.refutationCoverage` (default `false`); enabling it requires installing `@systemfsoftware/effect-schema-refutation` as a peer/devDependency and the generated file then imports `obligationsOf` from that package alongside `ruleOfSchemas` from `@systemfsoftware/effect-schema-law`.

Consumers must not hand-write codec-law properties for schemas the plugin covers — that rule lives in each consumer's own leaf (`effect-daemon-spec`, `hex-schema`, `stryker-plugins`).

```yaml
- id: VITE-V1
  title: The plugin's contract — injected laws replace hand-written ones
  do: tell consumers to rely on the injected law tests for round-trip identity and encode stability of every exported schema; hand-written property tests are for domain invariants
  dont: let a consumer hand-write it.prop cases re-asserting decode∘encode identity or S.equivalence roundtrips for a schema the plugin already covers
  harm: a hand-written law test duplicates the injected one and drifts — two sources of truth for the same law
  check: review — each consumer leaf's self-scoped S.equivalence grep returns nothing

- id: VITE-V2
  title: Obligation coverage is opt-in, so its absence is silent by construction
  do: pass `refutationCoverage: true` in a package whose schemas carry constraints — a refinement, a pattern, a length bound — and state the refusals with `refutes` from `@systemfsoftware/effect-schema-refutation`; a package whose schemas carry no constraint leaves it off and installs nothing
  dont: read a green suite in a coverage-off package as evidence that its refusals are adequate, or add a gate that turns coverage back on everywhere to remove the judgement
  harm: with coverage off, a schema that grows its first constraint gains an obligation nothing refuses, and no command anywhere says so — `ruleOfSchemas` still passes, because it draws only values the schema accepts. The loss is silent until someone re-reads this decision. That silence is the price of not forcing every round-trip consumer to resolve the refutation package, which is the whole reason the flag exists; a gate that removes the silence removes the opt-in with it
  check: review — when a schema in a coverage-off package gains its first constraint, whether that package flipped the flag in the same change
```

| Check | Command                                                       |
| ----- | ------------------------------------------------------------- |
| Types | `pnpm --filter @systemfsoftware/effect-schema-vite typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-vite test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-vite lint`      |
