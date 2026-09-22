# AGENTS.md — `@systemfsoftware/api-extractor`

Root `AGENTS.md` governs; this leaf carries only the package-local rules.

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                                | Gate                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **AE-R1** | Zero `@rushstack/*` or `@microsoft/api-extractor*` specifiers in `packages/api-extractor/src` and `packages/api-extractor/package.json`. All legacy Rushstack utilities are replaced by Effect 4 and Node built-ins.                                                                                | `grep -rn '@rushstack\|@microsoft/api-extractor' packages/api-extractor/src packages/api-extractor/package.json` prints nothing |
| **AE-R2** | Rollup emit for namespace barrels (`export * as X from './Y'`) must produce valid TypeScript declarations that compile without circular or unresolvable reference errors under `tsc --noEmit`.                                                                                                      | `pnpm --filter @systemfsoftware/api-extractor test`                                                                             |
| **AE-R3** | Silent on clean success: running `api-extractor run --quiet` (or with `"quiet": true` in `api-extractor.json`) against a valid package exits code 0 with completely empty stdout.                                                                                                                   | `pnpm --filter @systemfsoftware/api-extractor test:e2e`                                                                         |
| **AE-R4** | No child process spawning (`node:child_process`, `exec`, `spawn`, `fork`) anywhere in `src/` or non-e2e test suites. The entire analysis, collection, and generation pipeline runs in-process. Child process execution is restricted strictly to the tarball-testing contract lane in `tests/e2e/`. | `grep -rn 'child_process\|execSync\|spawnSync' packages/api-extractor/src` prints nothing                                       |
| **AE-R5** | Typed tagged errors only (`Schema.TaggedError` or `Data.TaggedError`). The analyzer, config loader, and generators must never throw untyped errors; all fatal defects route through Effect's error channel. Non-fatal compiler/TSDoc diagnostics route through the MessageRouter.                   | `pnpm --filter @systemfsoftware/api-extractor typecheck`                                                                        |

## Verification

```bash
pnpm --filter @systemfsoftware/api-extractor typecheck
pnpm --filter @systemfsoftware/api-extractor lint
pnpm --filter @systemfsoftware/api-extractor build
grep -rn '@rushstack\|@microsoft/api-extractor' packages/api-extractor/src packages/api-extractor/package.json
```
