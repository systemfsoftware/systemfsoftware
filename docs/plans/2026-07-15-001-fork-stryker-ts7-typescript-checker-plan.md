---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
date: 2026-07-15
---

# Backport: TS7-native `@systemfsoftware/stryker-js-typescript-checker`

## Goal Capsule

Fork `@stryker-mutator/typescript-checker` v9.6.1 into this monorepo as `@systemfsoftware/stryker-js-typescript-checker`, rewrite it to use TypeScript 7's native `typescript/unstable/sync` LSP-based API, and verify it drops into existing Stryker consumer packages.

## Product Contract

### Requirements

- **R1.** Export a Stryker `Checker` plugin named `typescript` via `declareFactoryPlugin(PluginKind.Checker, 'typescript', create)`.
- **R2.** Implement `TypescriptChecker` satisfying the `Checker` contract: `init()`, `check(mutants)`, and `group(mutants)`.
- **R3.** Use only the TS7 native API (`typescript/unstable/sync`, `typescript/unstable/ast`, `typescript/unstable/fs`); no root `typescript` imports for compiler APIs, no `ts.sys`, no `ts.createSolutionBuilderWithWatchHost`, no `ts.SourceFile`, no `ts.FileWatcherCallback`.
- **R4.** Provide an in-memory/hybrid `FileSystem` implementation that reads from disk and keeps writes/mutations in memory.
- **R5.** Parse `tsconfig.json` (including project references), run a dry-run type-check on `init()`, and report compile errors caused by mutants on `check()`.
- **R6.** Group mutants efficiently without violating dependency edges; mutants whose dependency influence zones overlap must not be checked together.
- **R7.** Format diagnostics into human-readable messages.
- **R8.** Build, type-check, lint, and test cleanly with the monorepo toolchain (`tsdown`, `tsc`, `oxlint`, `vitest`).
- **R9.** Wire the package into the workspace and consume `typescript` from the root catalog.
- **R10.** Preserve upstream test resources and behavioral parity.

### Scope boundaries

#### In scope

- `packages/stryker-js/typescript-checker/` package source, tests, and build config.
- Workspace wiring in `pnpm-workspace.yaml`.
- Replacing the upstream checker in consumer packages (`stryker-plugins`, `oxlint-plugin`, `effect-daemon-spec`) once the new package is viable.

#### Out of scope

- Forking or patching other Stryker packages (core, runner, api, etc.) unless end-to-end testing proves it necessary.
- Committed build artifacts (`dist/` remains gitignored).
- Ephemeral docs (`TEST_REPORT.md`, `TS7_API_RECIPE.md`) in the package directory.

## Planning Contract

### Key Technical Decisions

- **KTD1. TS7-native `API`/`Snapshot` model.** Replace the upstream `ts.createSolutionBuilderWithWatchHost` workflow with `new ts.API({ fs }) → api.parseConfigFile(...) → api.updateSnapshot(...) → Snapshot.getProjects() → Program.getSemanticDiagnostics()`.
- **KTD2. Hybrid file system.** Implement the `typescript/unstable/fs` `FileSystem` interface in `src/fs/hybrid-file-system.ts` so the TS7 API reads disk files and in-memory mutant writes through a single surface.
- **KTD3. Diagnostic shape adaptation.** TS7 diagnostics use `.text` (not `.messageText`) and `.fileName` (not `.file?.fileName`); formatters and check logic follow the new shape.
- **KTD4. Dependency-aware grouping.** Build a top-level import graph via `typescript/unstable/ast` and group mutants so overlapping influence zones are checked separately.
- **KTD5. Preserve upstream fixtures.** Copy `/tmp/upstream/stryker-js/packages/typescript-checker/testResources` verbatim to exercise parity.

## Implementation Units

### U1. Scaffold package and workspace wiring

- **Goal:** Create the package shell and monorepo integration.
- **Files:**
  - `packages/stryker-js/typescript-checker/package.json`
  - `packages/stryker-js/typescript-checker/tsconfig.json`
  - `packages/stryker-js/typescript-checker/tsdown.config.ts`
  - `packages/stryker-js/typescript-checker/vitest.config.ts`
  - `packages/stryker-js/typescript-checker/oxlint.config.ts`
  - `pnpm-workspace.yaml`
- **Approach:** Add `packages/stryker-js/*` to the workspace, set package name to `@systemfsoftware/stryker-js-typescript-checker`, use `typescript: catalog:`, extend shared tsconfig/vitest/oxlint configs, and wire `src/index.ts` as the tsdown entry.
- **Verification:** `pnpm install` resolves the package; `pnpm --filter @systemfsoftware/stryker-js-typescript-checker build` emits `dist/index.mjs` and `dist/index.d.mts`.

### U2. Implement TS7-native hybrid file system

- **Goal:** Provide the file surface the TS7 API expects while isolating mutations.
- **Files:**
  - `packages/stryker-js/typescript-checker/src/fs/hybrid-file-system.ts`
  - `packages/stryker-js/typescript-checker/src/fs/script-file.ts`
  - `packages/stryker-js/typescript-checker/src/fs/index.ts`
- **Approach:** Implement `FileSystem` (`readFile`, `writeFile`, `fileExists`, `readDirectory`, etc.) backed by a `Map<string, ScriptFile>` for in-memory overrides and disk fallback. Support `mutate`/`reset` for Stryker's per-mutant file changes.
- **Test scenarios:**
  - Read a file from disk when no override exists.
  - Write and read a file purely from memory.
  - Mutate a file, reset it, and verify disk content is restored.
  - List directory entries merging disk and in-memory entries.

### U3. Implement tsconfig parsing and compiler facade

- **Goal:** Parse tsconfig files and expose TS7 project diagnostics.
- **Files:**
  - `packages/stryker-js/typescript-checker/src/tsconfig-helpers.ts`
  - `packages/stryker-js/typescript-checker/src/typescript-compiler.ts`
- **Approach:** Strip JSON comments with a local helper, create `ts.API` with the hybrid file system, parse the config, open projects/snapshots, and run `getSemanticDiagnostics()`. Guard TS version and convert diagnostics to the new shape.
- **Test scenarios:**
  - Valid `tsconfig.json` opens without error.
  - Invalid/missing tsconfig produces a clear error.
  - Project-references configs are discovered and loaded.

### U4. Implement `TypescriptChecker` plugin

- **Goal:** Satisfy the Stryker `Checker` contract.
- **Files:**
  - `packages/stryker-js/typescript-checker/src/typescript-checker.ts`
  - `packages/stryker-js/typescript-checker/src/plugin-tokens.ts`
  - `packages/stryker-js/typescript-checker/src/index.ts`
- **Approach:** `init()` runs a dry-run type-check. `check(mutants)` applies each mutant to the file system, runs diagnostics, and maps results to `Passed`/`CompileError`. `group(mutants)` partitions mutants using the dependency graph.
- **Test scenarios:**
  - `init()` succeeds on a clean project.
  - `init()` fails on a project with pre-existing type errors.
  - A mutant introducing a type error returns `CompileError`.
  - A mutant that does not introduce a type error returns `Passed`.

### U5. Implement dependency-aware grouping

- **Goal:** Group mutants for performance while avoiding ambiguous blame.
- **Files:**
  - `packages/stryker-js/typescript-checker/src/grouping/create-groups.ts`
  - `packages/stryker-js/typescript-checker/src/grouping/ts-file-node.ts`
- **Approach:** Walk top-level import declarations with `typescript/unstable/ast` to build a file dependency graph; group mutants in files that are independent, separate mutants in files that share upstream dependencies.
- **Test scenarios:**
  - Mutants in unrelated files are grouped together.
  - Mutants in files sharing a dependency are not grouped together.

### U6. Port upstream integration tests and add plugin-entry coverage

- **Goal:** Prove behavioral parity with upstream fixtures.
- **Files:**
  - `packages/stryker-js/typescript-checker/test/integration/*.spec.ts`
  - `packages/stryker-js/typescript-checker/testResources/` (copied from upstream)
- **Approach:** Run the checker against each upstream fixture (`single-project`, `project-references`, `project-with-ts-buildinfo`, `errors`). Add an end-to-end test that exercises `createTypescriptChecker` through a minimal typed-inject-compatible injector.
- **Test scenarios:**
  - `single-project`: dry-run, Passed mutant, CompileError mutant, invalidation after reset.
  - `project-references`: multi-project references resolve.
  - `project-with-ts-buildinfo`: existing `.tsbuildinfo` handling.
  - `errors`: invalid tsconfig and pre-existing compile errors fail gracefully.
  - `e2e-plugin-entry`: public `createTypescriptChecker` factory reports `Passed`/`CompileError` correctly.

### U7. Wire consumer packages to the workspace checker

- **Goal:** Replace the upstream checker in packages that use Stryker mutation testing.
- **Files:**
  - `packages/effect-daemon-spec/package.json`
  - `packages/effect-daemon-spec/stryker.config.json`
  - `packages/oxlint-plugin/package.json`
  - `packages/oxlint-plugin/stryker.config.json`
  - `packages/stryker-plugins/package.json`
  - `packages/stryker-plugins/stryker.config.json`
  - `pnpm-lock.yaml`
- **Approach:** Swap the devDependency and plugin reference from `@stryker-mutator/typescript-checker` to `@systemfsoftware/stryker-js-typescript-checker` and regenerate the lockfile.
- **Verification:** `pnpm install` resolves the workspace dependency; consumer packages can invoke `pnpm mutation` (noting that Stryker core itself may need TS7 compatibility work for runs to complete).

## Verification Contract

### Definition of Done

1. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker typecheck` exits 0 with no `any` and no `@ts-ignore`/`@ts-expect-error`.
2. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker build` exits 0 and produces `dist/index.mjs` and `dist/index.d.mts`.
3. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker test` exits 0 with unit, integration, and e2e plugin-entry coverage.
4. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker lint` exits 0.
5. No root `typescript` imports for compiler APIs; only `typescript/unstable/sync`, `typescript/unstable/ast`, and `typescript/unstable/fs`.
6. `dist/` and build artifacts are gitignored.
7. Package does not depend on `@stryker-mutator/test-helpers`, `@stryker-mutator/core`, or `@stryker-mutator/instrumenter`.
8. Consumer packages are wired to the workspace checker.

### Verification commands

```text
pnpm --filter @systemfsoftware/stryker-js-typescript-checker typecheck
pnpm --filter @systemfsoftware/stryker-js-typescript-checker build
pnpm --filter @systemfsoftware/stryker-js-typescript-checker test
pnpm --filter @systemfsoftware/stryker-js-typescript-checker lint
```

## Risks & Dependencies

- **Stryker core TS7 compatibility.** `@stryker-mutator/core@9.6.1` calls `ts.parseConfigFileTextToJson`, which TypeScript 7 removed. End-to-end mutation runs may fail in Stryker core before reaching the new checker. Mitigation: patch or fork Stryker core if end-to-end verification is required.
- **TS7 unstable API churn.** The native API is experimental and may change between TypeScript 7 prereleases.
- **Dependency graph accuracy.** Incorrect grouping can produce false blame; coverage must include shared-dependency cases.

## Sources & Research

- Upstream reference: https://github.com/stryker-mutator/stryker-js (`packages/typescript-checker` v9.6.1)
- TypeScript 7 native API: `typescript/unstable/sync`, `typescript/unstable/ast`, `typescript/unstable/fs`
- Monorepo conventions: `AGENTS.md`, `pnpm-workspace.yaml`, shared tsconfig/vitest/oxlint configs
