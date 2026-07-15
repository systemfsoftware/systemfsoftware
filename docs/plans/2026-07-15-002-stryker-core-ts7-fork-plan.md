---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan
date: 2026-07-15
deepened: 2026-07-15
origin: docs/plans/2026-07-15-002-stryker-core-ts7-fork-plan.md
---

# Fork & Modernize `@stryker-mutator/core` for TS7 — Plan

## Goal Capsule

Fork `@stryker-mutator/core` v9.6.1 into this monorepo as `@systemfsoftware/stryker-js-core`. The source is already copied (~107 files in `packages/stryker-js/core/src/`). Replace the current hybrid build (`bun` for sandbox + `cp` from npm dist) with a single `tsdown` build. The only file that needs TS7 changes is `ts-config-preprocessor.ts` — its TS6 APIs (`parseConfigFileTextToJson`, `resolveProjectReferencePath`) are already replaced with local TS7-native helpers. Fix the `tsconfig.json`, wire consumer packages, delete old build tooling (`build-fork.mjs`, `patches/`). Keep `@systemfsoftware/stryker-js-typescript-checker` as-is.

---

## Product Contract

### Requirements

- **R1.** `@systemfsoftware/stryker-js-core` has the same public shape as `@stryker-mutator/core` — same exports, same `stryker` bin entry, same plugin entry. Consumer packages swap one dep line.
- **R2.** Single tsdown build (ESM `.mjs` + `.d.mts`), proper `package.json#exports` with subpath exports matching the upstream.
- **R3.** tsconfig accepts the forked upstream code without 500+ type errors (manual strict-mode exceptions for the forked code).
- **R4.** The sandbox preprocessor (`ts-config-preprocessor.ts`) uses only TS7-native APIs via local helpers; no dynamic `import('typescript')`.
- **R5.** Consumer packages reference `"@systemfsoftware/stryker-js-core"` in `devDependencies` and `"plugins": ["@systemfsoftware/stryker-js-core"]` in `stryker.config.json`.
- **R6.** Delete: `scripts/build-fork.mjs`, `patches/`, `docs/solutions/runtime-errors/stryker-core-ts6-api-removal.md`.

### Scope boundaries

**In scope:**

- `packages/stryker-js/core/` — tsconfig, package.json, tsdown.config, vitest.config, source (already present).
- Consumer wiring: `effect-daemon-spec`, `oxlint-plugin`, `stryker-plugins`.
- Removal of old build tooling.

**Out of scope:**

- Forking `@stryker-mutator/api`, `@stryker-mutator/instrumenter`, `@stryker-mutator/util` — they work with TS7 as-is.
- Porting upstream functional tests (upstream doesn't ship tests in npm). Existing 3 test files in `test/` are kept and runnable.
- `@systemfsoftware/stryker-js-typescript-checker` — already works, no changes.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. tsconfig with relaxed strictness.** Shared config has `strict: true`, `verbatimModuleSyntax: true`, `noPropertyAccessFromIndexSignature: true`, etc. The forked upstream code (107 files from `@stryker-mutator/core` v9.6.1, written for TS6) was not written for these. Set `strict: false`, `verbatimModuleSyntax: false`, `noPropertyAccessFromIndexSignature: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `exactOptionalPropertyTypes: false`, `isolatedModules: false` in the package's `tsconfig.json`. This is controlled opt-out for a vendored fork, not a repo-wide relaxation. Of 503 total strict-mode errors, 488 are from upstream code (TS6 patterns) and 15 are from sandbox files (all `type`-import boilerplate fixed by `verbatimModuleSyntax: false`).
- **KTD2. The preprocessor is already fixed.** `ts-config-preprocessor.ts` imports `parseConfigFileTextToJson` from `./parse-config-helper.ts` and `resolveProjectReferencePath` from `./resolve-reference-helper.ts` — both TS7-native. No further changes needed.
- **KTD3. Full fork, not thin fork.** A thin fork (re-export from npm + override one file) doesn't work because Stryker dynamically imports the preprocessor at runtime by internal path — overriding it requires owning the caller too. Full fork is structurally necessary.
- **KTD4. tsdown entry is `src/index.ts`.** tsdown bundles from the existing `src/index.ts` which re-exports all public symbols. The `exports` field in `package.json` mirrors upstream: `"."` points to the entry, `"./package.json"` is standard.
- **KTD5. `@stryker-mutator/{api,instrumenter,util}` remain runtime deps.** Our fork uses these at runtime; they're not forked. Only core is forked.
- **KTD6. Bin entry (`stryker` CLI) maps through `package.json#bin`.** `bin/stryker.js` already exists at `packages/stryker-js/core/bin/stryker.js`. The build preserves it — tsdown compiles the sandbox and main source; the bin entry is a thin wrapper that imports from the built dist. No change to the CLI invocation path.

---

## Implementation Units

### U1. Fix tsconfig and package scaffolding

**Goal:** Make the existing source typecheck and build cleanly.

**Files:**

- `packages/stryker-js/core/tsconfig.json`
- `packages/stryker-js/core/tsdown.config.ts`
- `packages/stryker-js/core/vitest.config.ts`

**Approach:** The tsconfig extends `@systemfsoftware/tsconfig/tsc/no-dom/library` which has strict mode. Override the strict settings incompatible with forked upstream code:

- `strict: false`, `verbatimModuleSyntax: false`, `noPropertyAccessFromIndexSignature: false`
- `noUnusedLocals: false`, `noUnusedParameters: false`, `exactOptionalPropertyTypes: false`
- `isolatedModules: false` (forbids `const enum` which `mutation-testing-metrics` uses)
- `types: ["node", "vitest/globals"]` (source needs `node:*`, test files use vitest globals)

Three existing test files at `test/` (typechecked and runnable):

- `test/integration/ts-config-preprocessor.it.spec.ts`
- `test/unit/parse-config-helper.spec.ts`
- `test/unit/resolve-reference-helper.spec.ts`

tsdown.config: single entry `src/index.ts`, output `dist/`, ESM format, emit dts.

vitest.config: use `@systemfsoftware/vitest-config` base, point at `test/`.

**Test expectation:** none — configuration only.

**Verification:** `pnpm --filter @systemfsoftware/stryker-js-core typecheck` exits 0. `pnpm --filter @systemfsoftware/stryker-js-core build` exits 0 and produces `dist/index.mjs` + `dist/index.d.mts`. `pnpm --filter @systemfsoftware/stryker-js-core test` runs the 3 existing test files successfully.

---

### U2. Verify build output matches upstream expectations

**Goal:** Confirm the tsdown build produces a drop-in replacement for `@stryker-mutator/core` at the bin entry and main export.

**Files:**

- (output only: `dist/`)

**Approach:** Verify:

1. `dist/src/index.mjs` exports `Stryker`, `StrykerCli`, and plugin symbols.
2. `bin/stryker.js` exists and is executable.
3. No internal import paths are broken.

**Test expectation:** none — verify manually once after U1 build.

---

### U3. Wire consumer packages

**Goal:** Consumer packages reference `@systemfsoftware/stryker-js-core` instead of `@stryker-mutator/core`.

**Files:**

- `packages/effect-daemon-spec/package.json`
- `packages/effect-daemon-spec/stryker.config.json`
- `packages/oxlint-plugin/package.json`
- `packages/oxlint-plugin/stryker.config.json`
- `packages/stryker-plugins/package.json`
- `packages/stryker-plugins/stryker.config.json`

**Approach:** Replace `"@stryker-mutator/core"` with `"@systemfsoftware/stryker-js-core"` in both `dependencies`/`devDependencies` and the `plugins` array. Run `pnpm install`.

**Test expectation:** none — configuration.

**Verification:** `pnpm install` resolves. `pnpm --filter <any consumer> mutation -- --dry-run` starts without import errors.

---

### U4. Delete old build tooling

**Goal:** Remove the old hybrid build approach.

**Files:**

- `scripts/build-fork.mjs` — delete
- `patches/` — delete directory
- `docs/solutions/runtime-errors/stryker-core-ts6-api-removal.md` — delete

**Test expectation:** none — cleanup only.

---

### U5. End-to-end verification

**Goal:** Prove the forked core works in a real Stryker mutation run.

**Approach:** Run `pnpm --filter @systemfsoftware/effect-daemon-spec mutation`.

**Test scenarios:**

- Mutation dry-run starts and reaches instrumentation phase
- A full mutation run completes with generated report
- The `@systemfsoftware/stryker-js-typescript-checker` plugin loads alongside

---

## Verification Contract

### Definition of Done

1. `pnpm --filter @systemfsoftware/stryker-js-core typecheck` exits 0.
2. `pnpm --filter @systemfsoftware/stryker-js-core build` exits 0, produces `dist/index.mjs` + `dist/index.d.mts`.
3. `pnpm --filter @systemfsoftware/stryker-js-core test` runs 3 existing tests.
4. `dist/` is gitignored.
5. Three consumer packages wire to `@systemfsoftware/stryker-js-core`.
6. `scripts/build-fork.mjs`, `patches/`, stale solution doc deleted.
7. `pnpm install` resolves cleanly.
8. `pnpm --filter @systemfsoftware/effect-daemon-spec mutation -- --dry-run` starts without import/crash errors.

### Verification commands

```text
pnpm --filter @systemfsoftware/stryker-js-core typecheck
pnpm --filter @systemfsoftware/stryker-js-core build
pnpm --filter @systemfsoftware/stryker-js-core test
pnpm install
pnpm --filter @systemfsoftware/effect-daemon-spec mutation -- --dry-run
```

---

## Risks & Dependencies

- **Strict-mode overrides masking sandbox bugs.** 488/503 strict errors come from upstream TS6-era code — our sandbox files only have 15 trivial `type`-import boilerplate errors. Mitigation: the sandbox tests (`test/integration/ts-config-preprocessor.it.spec.ts`, `test/unit/parse-config-helper.spec.ts`) exercise the preprocessor with real tsconfig files, catching semantic bugs regardless of strictness.
- **TS7 API surface for sandbox helpers.** Already verified working via the bun-build path — the TS7-native `parseConfigFileTextToJson` and `resolveProjectReferencePath` helpers exist and are imported.
- **Consumer compatibility.** Plugin entry export matches what Stryker expects. No API contract difference.

---

## Sources & Research

- Upstream reference: `@stryker-mutator/core@9.6.1` in the pnpm store at `node_modules/.pnpm/`
- Existing fork at `packages/stryker-js/core/` — source already copied
- `parse-config-helper.ts` and `resolve-reference-helper.ts` already implement TS7-native preprocessor APIs
- `@systemfsoftware/stryker-js-typescript-checker` fork at `packages/stryker-js/typescript-checker/`
