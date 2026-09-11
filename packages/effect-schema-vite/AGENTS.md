# AGENTS.md — `@systemfsoftware/effect-schema-vite`

Exports `inlineSchemaTests`: a Vite plugin that walks the consumer's `src/`, finds every exported Effect `Schema`, and generates `ruleOfSchemas` tests, materializing every `recursionBudget` annotation it finds on the way. Root `AGENTS.md` governs.

## Rules

| ID          | Rule                                                                                                                                                                                                                                                                                                                                                               | Gate                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **VITE-V1** | Consumers rely on the injected law tests for round-trip identity and encode stability of every exported schema — never hand-write `it.prop` cases re-asserting `decode∘encode` identity or `S.equivalence` roundtrips for a covered schema (hand-written property tests are for domain invariants).                                                                | `grep -rnE 'S\.equivalence' packages/effect-daemon-spec/src packages/hex-schema/src packages/stryker-js/stryker-plugins/src` returns nothing |
| **VITE-V2** | Laws are injected by rewriting the consumer's real `src/schema-laws.test.ts` on disk through the `transform` hook — never a virtual module (a virtual id has no path for vitest's `--related` walk and every generated law would be silently dropped). That basename is the only test filename `@systemfsoftware/oxlint-plugin-test-placement` whitelists by name. | `review`                                                                                                                                     |
| **VITE-V3** | The plugin a consumer registers materializes declared generation budgets too, and resolves the specifier the injected hook imports — a consumer who registers `inlineSchemaTests` alone never gets an unresolvable import or a budget that silently does nothing.                                                                                                  | `pnpm --filter @systemfsoftware/effect-schema-vite test` exits 0                                                                             |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-schema-vite typecheck
pnpm --filter @systemfsoftware/effect-schema-vite test
pnpm --filter @systemfsoftware/effect-schema-vite lint
```
