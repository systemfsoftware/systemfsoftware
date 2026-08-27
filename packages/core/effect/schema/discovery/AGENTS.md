# AGENTS.md — `@systemfsoftware/effect-schema-discovery`

Source-discovery walk for `@systemfsoftware/effect-schema-vite`. A published package cannot import a sibling's internals, so the shared walk lives here as a plain `dependency`.

Exports `FoundSchema`, `findExportedSchemas`, `quote`, `identityOf`. Pure decision `findExportedSchemaNames` lives in `src/internal/schema-names.ts`.

| Check | Command                                                            |
| ----- | ------------------------------------------------------------------ |
| Types | `pnpm --filter @systemfsoftware/effect-schema-discovery typecheck` |
| Test  | `pnpm --filter @systemfsoftware/effect-schema-discovery test`      |
| Lint  | `pnpm --filter @systemfsoftware/effect-schema-discovery lint`      |
