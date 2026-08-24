# AGENTS.md — `@systemfsoftware/effect-schema-discovery`

> **Location:** `packages/core/effect/schema/discovery/` — shared Effect Schema source-discovery walk used by the two Vite plugins.

This package exists because `@systemfsoftware/effect-schema-vite` and `@systemfsoftware/effect-schema-refutation-vite` walk the same directory for the same exported `Schema` declarations. A published package cannot import a sibling's internals, so the shared walk lives here. Both plugins depend on this package as a plain `dependency`; a consumer installs the plugins and never names this package.

Exports `FoundSchema`, `findExportedSchemas`, `quote`, `identityOf`, `findRefutedIdentities`. Pure decision `findExportedSchemaNames` lives in `src/internal/schema-names.ts` (exported `@internal` for the walk); remaining predicates `typeRefContainsSchema`, `SCHEMA_USE_MEMBERS`, `isSchemaUseCall`, `initRefersToSchema`, `memberChainStartsWithS`, `extendsSchemaClass` and the refutes helpers stay interior.

| Check | Command                                                            |
| ----- | ------------------------------------------------------------------ |
| Types | `pnpm --filter @systemfsoftware/effect-schema-discovery typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-discovery test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-discovery lint`      |
