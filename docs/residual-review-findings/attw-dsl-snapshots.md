# Residual Review Findings — attw-dsl-snapshots

Source run: LFG pipeline, head `013f7eb386b`, plan `docs/plans/2026-08-23-001-feat-attw-fixture-dsl-plan.md`.

## Applied in this run

- `packPackage` binary-body corruption and `Package` mutation — fixed with a byte-preserving `tryReadBytes` accessor and copy-on-construct.
- AE7 parity gate dead / per-recipe snapshots self-satisfying — replaced `snapshots.integration.test.ts` with a schema-driven kind-coverage assertion (`ProblemKindSchema.literals`) plus a per-recipe assertion that each kind-named recipe reports its own kind.
- `gzipSync` non-deterministic mtime — pinned `{ mtime: 0 }`.
- compiler-host-cache vacuous fallback — switched to a 3-file recipe with a loud failure on <3 files.

## Deferred (not applied)

- P2 — `packages/testing/type-testing/arethetypeswrong/cli/tests/__fixtures__/GlobalSetup.ts:10-11` — CLI test lane deep-imports `../../../core/src/...` instead of the declared `@systemfsoftware/arethetypeswrong-core` package surface. Binds the lane to core's internal file layout.
- P2 — `packages/testing/type-testing/arethetypeswrong/core/src/CreatePackage.ts:137-151` — `toDirectoryJSON` returns `DirectoryJSON = Record<string, string | Uint8Array | null>` which is not structurally assignable to memfs `Contents` (`string | Buffer | null`); consumers cast `as never`.
- P2 — `packages/testing/type-testing/arethetypeswrong/core/src/pack.ts:15-16` — `packPackage` silently drops files outside the package's own `/node_modules/<name>/` prefix, including `@types` companions merged via `mergedWithTypes`. Inconsistent with `createPackage`/`packTree`/`toDirectoryJSON`, which throw.
- P2 — `packages/testing/type-testing/arethetypeswrong/core/src/recipes.ts:12` — the `recipes` record mixes the 12 `Problem` kinds with companion fixtures (`TypesCompanion`, `TypesCompanionTypes`, `KnownBad`, `MultiEntrypoint`); consumers filter with string-keyed skip lists.
- P1 — extractor fidelity narrowed: `tarball-extract` now round-trips only self-generated ustar; real-world tar variants (PAX global headers, GNU long names) are no longer exercised by committed fixtures. Accepted tradeoff of the synthetic-fixture plan.
- P1 — `check-package` executor/layer path is now exercised only in the Docker-gated contract lane; it lost its core-suite coverage when `semver` fixture reads moved to recipes.

## Environment note

The CLI contract lane (`test:contract`) could not run locally: podman netavark fails with `Read-only file system` (HTTP 500). The lane compiles (`typecheck` green); it must run in CI.
