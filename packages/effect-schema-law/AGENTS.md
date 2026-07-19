# AGENTS.md — `@systemfsoftware/effect-schema-law`

> **Location:** `packages/effect-schema-law/` — property-test codec laws for any Effect Schema in one call. Universal agent rules live in the root `AGENTS.md`; this file carries only `effect-schema-law/`-specific deltas.

Single-function API: `assertCodecLaws(schema)`. Tests decode/encode round-trip identity + encode stability via `@effect/vitest` + fast-check.

## Key invariants

- Accepts any `Schema<S, A, R>` — generics MUST not be restrictive.
- Arbitraries are derived from the schema itself, never hand-written per test.
- Fails on the first law violation with a clear message naming the broken law.
