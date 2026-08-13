---
title: "Add effect-gherkin-spec-v4 package on effect v4 RC - Plan"
date: 2026-08-13
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

- **Objective:** Create a private workspace package `@systemfsoftware/effect-gherkin-spec-v4` as a copy of `@systemfsoftware/effect-gherkin-spec` retargeted at the effect v4 release candidate (`effect@4.0.0-rc.108`, `@effect/vitest@4.0.0-rc.108`), resolving both through a dedicated named pnpm catalog, with the source and tests migrated to the v4 API surface.
- **Authority hierarchy:** This plan obeys the repo `AGENTS.md` and `CONSTITUTION.md`. REPO-S3 (`repos/` read-only) and REPO-W4 (read the vendored `repos/effect-v4` tree, not memory or `node_modules`) bind the migration research. REPO-R2 (changeset) does not apply — the package is private.
- **Stop conditions:** Code-complete when the new package's `typecheck`, `test`, and `build` scripts exit 0 and the original `@systemfsoftware/effect-gherkin-spec` package still passes its own checks unchanged. Stop and surface a blocker if the v4 RC is missing an API the port requires after diagnosis; do not fall back to a partial migration.
- **Execution profile:** One new private package; a mechanical copy plus a bounded source migration. Nothing publishes; nothing touches the v3 package or the rest of the monorepo.
- **Tail ownership:** The plan author owns implementation through code-complete. Merge and any publish remain human-gated (REPO-P1); the package is private, so no publish path exists.

---

## Product Contract

### Summary

The monorepo's `effect-gherkin-spec` package runs on effect v3. This plan adds a private sibling, `effect-gherkin-spec-v4`, that runs on the effect v4 release candidate so v4 can be exercised inside the workspace without disturbing the published v3 surface. The v4 copy is `private: true` (never published) and resolves its Effect dependencies through a new named catalog.

### Problem Frame

effect v4 is a breaking rewrite of the APIs this package wraps: `Either` became `Result`, `Context.Tag` became `Context.Service`, `Effect.catchAllCause` became `catchCause`, `Cause.UnknownException` became `UnknownError`, and the `effect/TestServices` module was removed in favor of a `TestClock`/`TestConsole` test environment provided by `@effect/vitest`. A copy-and-bump is therefore insufficient — the package body must migrate. The original v3 package and the rest of the monorepo must stay untouched.

### Requirements

**Packaging**

- R1. A new workspace package `packages/effect-gherkin-spec-v4` exists, named `@systemfsoftware/effect-gherkin-spec-v4`, marked `private: true`, and no `.changeset/` intent accompanies it.
- R2. The package's `effect` and `@effect/vitest` dependencies and peers resolve to the v4 RC (`^4.0.0-rc.108`) through a dedicated named pnpm catalog, never through the default catalog and never through a hardcoded range.
- R3. The package is non-publishable: no `publishConfig`, no `provenance`, no changeset, and it is absent from the root README's published-package table; dev-time tools (`attw`) carry over unchanged from the source package.

**Migration and compatibility**

- R4. The package source and tests compile, typecheck, and pass against v4: no reference remains to `effect/TestServices`, `Either`, `Context.Tag`, `Effect.catchAllCause`, `Effect.either`, `Cause.UnknownException`, or the removed `@effect/vitest` `scoped`/`scopedLive` surface.
- R5. The public entry points are preserved: `makeFeature`, the `Gherkin`/`Given`/`When`/`Then`/`And`/`But` steps, `pairwiseFor`, `resolveScenarioArgs`, the outline helpers, `StepError`, and the `excludeTestServices` option (which survives in v4's `@effect/vitest`).

**Isolation**

- R6. The original `packages/effect-gherkin-spec` package and every other workspace package are unchanged by this work.

### Scope Boundaries

- **In scope:** the new package directory, the `effect-v4` catalog entry, the regenerated lockfile, the source/test migration, and verification.
- **Out of scope:** migrating any other package to v4; publishing the v4 package; a full parallel v4 catalog mirroring every `@effect/*` package; any change to the v3 package.
- **Deferred to follow-up:** none material — the v4 package is an isolated experiment surface.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Pin the v4 RC in a dedicated named catalog `effect-v4` (`effect: ^4.0.0-rc.108`, `@effect/vitest: ^4.0.0-rc.108`), leaving the default catalog on v3. Separate named catalogs per major version is the repo's established convention (`docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`), and `@effect/vitest@4.0.0-rc.108` peers only on `effect ^4.0.0-rc.108` and `vitest >=4.1.0 <5.0.0` — the default catalog's `vitest: ^4.1.10` already satisfies the peer, so `vitest` stays in the default catalog.
- KTD2. The `TestServices.TestServices` type re-expresses as `TestClock.TestClock | TestConsole.TestConsole` (v4's test-environment union), sourced from `effect/TestClock` and `effect/TestConsole`. `@effect/vitest` v4 still honors `excludeTestServices`, so R5's option survives unchanged.
- KTD3. Private-package convention mirrors `packages/vitest-config` and `packages/oxlint-config`: keep `version`, drop `publishConfig` and `provenance`, omit a changeset, and omit the root README table row. The stale `etc/effect-gherkin-spec.api.md` is not carried forward — `effect-gherkin-spec` has no `api-extractor.json` and no `api:check` script, so the report is dead weight nothing consumes.

### Assumptions

- `Schema.Unknown` and `Schema.String` remain valid in v4 (verified in `repos/effect-v4/packages/effect/src/Schema.ts`); `Schema.TaggedError` is the class in v4, so the existing call syntax is expected to hold — verify against v4 Schema during implementation.
- `vitest.setup.ts` imports `FastCheck` from the `effect` barrel; in v4 it moved under `effect/testing`. Verify the import path and adjust if the barrel no longer re-exports it.
- The in-source `if (import.meta.vitest !== void 0)` block at the bottom of `feature.kernel.ts` is part of the source migration (U3), not a separate test concern.

### Sequencing

U1 (catalog) → U2 (scaffold) → U3 (source migration) → U4 (test migration). U4 depends on U3 because the test files import both the new package name and `../src/mod.js`, which must be migrated before the tests typecheck.

### Sources / Research

- `repos/effect-v4/migration/v3-to-v4.md` — the authoritative v3→v4 rename ledger (read for `TestServices`, `Either`, `Context`, `Effect.catchAllCause`, `Cause.UnknownException`, `Schema`).
- `repos/effect-v4/packages/vitest/src/index.ts` and `internal/internal.ts` — the v4 `@effect/vitest` surface (`MethodsNonLive<R>`, `TestContext = TestConsole | TestClock`, `excludeTestServices`).
- `repos/effect-v4/packages/effect/src/{Result,Context,Cause,Effect,Schema}.ts` — v4 replacements confirmed in source.
- npm dist-tags: `effect` and `@effect/vitest` both expose `rc: 4.0.0-rc.108` (2026-08-13).
- `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md` — named-catalog convention and per-major-version separation.

---

## Implementation Units

### U1. Declare the `effect-v4` catalog

- **Goal:** Add the named catalog pinning the v4 RC and regenerate the lockfile.
- **Requirements:** R2.
- **Dependencies:** none.
- **Files:** `pnpm-workspace.yaml` (modify), `pnpm-lock.yaml` (regenerated).
- **Approach:**
  1. Add a `catalogs.effect-v4` block with `effect: ^4.0.0-rc.108` and `@effect/vitest: ^4.0.0-rc.108`.
  2. Leave `vitest` in the default catalog (KTD1).
  3. Run `pnpm install` to regenerate the lockfile; confirm the catalog entry is inert until a package references it.
- **Patterns to follow:** the existing named catalogs `oxlint`, `stryker`, `attw` in `pnpm-workspace.yaml`.
- **Test scenarios:** Test expectation: none — a catalog entry no package references carries no behavior. Its risk (a malformed catalog or a peer mismatch) surfaces at `pnpm install`.
- **Verification:** `pnpm install` exits 0; the only diffs are `pnpm-workspace.yaml` and `pnpm-lock.yaml`.

### U2. Scaffold the private `-v4` package

- **Goal:** Copy the package tree, rename its identity, mark it private, and point its Effect deps at the new catalog.
- **Requirements:** R1, R2, R3.
- **Dependencies:** U1.
- **Files:** `packages/effect-gherkin-spec-v4/**` (create, from `packages/effect-gherkin-spec/**`), excluding `etc/`.
- **Approach:**
  1. Copy the package directory to `packages/effect-gherkin-spec-v4`, omitting `etc/` (KTD3).
  2. In the new `package.json`: set `name` to `@systemfsoftware/effect-gherkin-spec-v4`; add `private: true`; drop `publishConfig` and `provenance`; update `repository.directory` and `homepage` to the `-v4` path.
  3. Change `effect` and `@effect/vitest` in both `devDependencies` and `peerDependencies` from `catalog:` to `catalog:effect-v4`.
  4. Change the `vitest` peer from `*` to `>=4.1.0 <5.0.0` to match `@effect/vitest` v4 (KTD1).
  5. Keep `version` (`0.5.1`, cosmetic for a private package — mirrors `packages/vitest-config`).
- **Patterns to follow:** `packages/vitest-config/package.json` and `packages/oxlint-config/package.json` for the private-manifest shape.
- **Test scenarios:** Test expectation: none — scaffolding. The copy does not compile against v4 until U3 and U4 land.
- **Verification:** `pnpm install` exits 0 and resolves the new package into the workspace with no unmet-peer warnings.

### U3. Migrate the source kernels to v4

- **Goal:** Port the seven source files to the v4 API surface.
- **Requirements:** R4, R5.
- **Dependencies:** U2.
- **Files:** `packages/effect-gherkin-spec-v4/src/do-notation.kernel.ts`, `feature-runtime.kernel.ts`, `feature.kernel.ts`, `outline-expand.kernel.ts`, `step-error.kernel.ts`, `extensions/pairwise.kernel.ts`.
- **Approach:** Apply the v3→v4 renames per file, using `repos/effect-v4/migration/v3-to-v4.md` as the authority:
  1. `do-notation.kernel.ts` and `extensions/pairwise.kernel.ts`: `Effect.catchAllCause` → `Effect.catchCause`.
  2. `feature-runtime.kernel.ts` and `outline-expand.kernel.ts`: replace `effect/Either` with `effect/Result` — `Either.isLeft` → `Result.isFailure`, `Either.left`/`Either.right` → `Result.fail`/`Result.succeed`, and the `Either.Either` return type with `Result.Result` (its `.left`/`.right` fields become `.failure`/`.success`).
  3. `extensions/pairwise.kernel.ts`: `Context.Tag<Identifier, Service>` → `Context.Service<Identifier, Service>`.
  4. `feature.kernel.ts`: remove `import * as TestServices from 'effect/TestServices'`; import the `TestClock` and `TestConsole` type namespaces and replace every `TestServices.TestServices` with `TestClock.TestClock | TestConsole.TestConsole` (KTD2). Then adapt the `@effect/vitest` surface: `Vitest.MethodsNonLive<R, boolean>` becomes `Vitest.MethodsNonLive<R>`, the removed `scoped`/`scopedLive` testers are replaced with the v4 equivalents (`effect`/`live` at `Tester<Scope.Scope>`), and `selectLayeredMode`'s reliance on `MethodsNonLive['scoped']` is re-expressed against the v4 `MethodsNonLive` surface. This step is the one non-mechanical piece.
  5. `step-error.kernel.ts`: confirm `Schema.TaggedError` and `Schema.Unknown` call syntax under v4 Schema; adjust if the rewrite changed the constructor.
  6. `mod.ts`: unchanged — it re-exports `@effect/vitest` and the migrated kernels.
- **Execution note:** Drive this with `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 typecheck` after each rename family, not by hand-auditing the whole tree.
- **Patterns to follow:** the v3 source is the template; `repos/effect-v4/packages/vitest/src/index.ts` is the v4 surface reference.
- **Test scenarios:**
  - The package typechecks with no `TestServices`, `Either`, `Context.Tag`, `catchAllCause`, or `scoped` references remaining under `src/`.
  - `makeFeature`'s `excludeTestServices` option still type-checks end-to-end (R5).
- **Verification:** `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 typecheck` exits 0.

### U4. Migrate the tests to v4

- **Goal:** Port the four integration test files and `vitest.setup.ts` to v4 and the new package name.
- **Requirements:** R4, R5.
- **Dependencies:** U2, U3.
- **Files:** `packages/effect-gherkin-spec-v4/__tests__/*.integration.test.ts` (four files), `vitest.setup.ts`.
- **Approach:**
  1. In every test file, rename the `@systemfsoftware/effect-gherkin-spec` import to `@systemfsoftware/effect-gherkin-spec-v4`.
  2. `scenario-args-resolution.integration.test.ts`: `Effect.either` → `Effect.result`, `Either.left` → `Result.fail`, `Either` → `Result`.
  3. `scenario-outline-template-expansion.integration.test.ts` and `gherkin-step-combinators.integration.test.ts`: `Either` → `Result`.
  4. `pairwise-dual-side-execution.integration.test.ts`: `Context.Tag('test/Widget')<...>()` → `Context.Service('test/Widget')<...>()`, `Cause.UnknownException` → `Cause.UnknownError`, `Effect.either` → `Effect.result`, `Either.isLeft` → `Result.isFailure`.
  5. `gherkin-step-combinators.integration.test.ts`: confirm `Schema.TaggedError`/`Schema.String` syntax under v4 Schema.
  6. `vitest.setup.ts`: confirm or fix the `FastCheck` import path for v4 (assumption above); `addEqualityTesters` is unchanged.
- **Test scenarios:**
  - The Gherkin step-combinator suite passes: Given/When bind into the scope, Then/And/But tap it, failures surface as `StepError`.
  - The outline-expansion suite passes: tokenisation, title stringification, and row expansion via `expandOutline`.
  - The argument-resolution suite passes: malformed `scenario(...)` shapes return the defensive failing pipeline.
  - The pairwise suite passes: dual-side execution reads distinct services, a second-side failure surfaces as `StepError`, and `Layer.fresh` acquires each side once.
- **Verification:** `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 test` exits 0; `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 test:types` exits 0 (no `.tst.ts` files today, so this is a no-op pass).

---

## Verification Contract

| Gate              | Command                                                           | Units  | Pass signal                                                         |
| ----------------- | ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Install           | `pnpm install --frozen-lockfile`                                  | U1, U2 | Exits 0; lockfile is committed                                      |
| Source typecheck  | `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 typecheck` | U3     | Exits 0                                                             |
| Tests             | `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 test`      | U4     | Exits 0; all four suites run                                        |
| Build             | `pnpm --filter @systemfsoftware/effect-gherkin-spec-v4 build`     | U3, U4 | Exits 0                                                             |
| v3 non-regression | `pnpm --filter @systemfsoftware/effect-gherkin-spec test`         | U1–U4  | Exits 0; `packages/effect-gherkin-spec/**` is untouched in the diff |
| Full gate         | `pnpm check:local`                                                | All    | Exits 0 after the last edit (REPO-D1)                               |

---

## Definition of Done

- The `effect-v4` catalog and the private `@systemfsoftware/effect-gherkin-spec-v4` package exist and are committed.
- Every source and test file in the new package compiles against effect v4 with no v3 API reference remaining.
- The four integration test suites pass against v4, and the package builds.
- `pnpm check:local` exits 0 after the last edit.
- The original `effect-gherkin-spec` package and the rest of the monorepo are byte-identical in the diff.
- No abandoned scaffolding: the new package contains only the migrated source, tests, and config — no dead `etc/` report, no stray `publishConfig`.
