---
title: Declare vitest snapshot-testing dependencies where snapshot matchers run - Plan
type: fix
date: 2026-08-29
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Declare vitest snapshot-testing dependencies where snapshot matchers run - Plan

## Goal Capsule

- **Objective:** Every owned package whose tests use a vitest snapshot matcher declares `@vitest/snapshot` at the same version as the `vitest` it resolves, so the snapshot suite of `@systemfsoftware/arethetypeswrong` passes on a fresh install with the native matcher and no read-and-compare workaround.
- **Means:** Declare `@vitest/snapshot` at the catalog pin in the one package that currently uses snapshot matchers, and add a single `@vitest/snapshot` entry next to `vitest` in the workspace catalog so `catalog:` resolves both to the same version (KTD1, KTD2).
- **Authority:** Issue #306 (open, priority p1, area toolchain). The issue's Goal, Acceptance Criteria, and Boundaries are the user's stated contract; this plan implements them.
- **Stop conditions:** AC1–AC4 of issue #306 are green — (AC1) `pnpm install --frozen-lockfile` succeeds on the changed tree and `CI=true pnpm --filter @systemfsoftware/arethetypeswrong exec vitest run tests/snapshots.integration.test.ts` exits 0 with `toMatchFileSnapshot` in the test file; (AC2) every owned matcher-using package declares `@vitest/snapshot` at the vitest-matching version with one shared instance; (AC3) a cold-worktree or CI fresh-install run passes the analysis suite; (AC4) the ea59847 read-and-compare block does not reappear.
- **Execution profile:** Dependency-declaration and lockfile work; verification is install and test-run gates, not new unit tests.

## Product Contract

### Summary

`@systemfsoftware/arethetypeswrong`'s analysis tests call `expect(...).toMatchFileSnapshot(...)`; vitest's dist imports `@vitest/snapshot` (the `SnapshotClient` host) from vitest's own dependency closure. The package declares `vitest` but not `@vitest/snapshot`, so the snapshot machinery's version rides vitest's transitive dependency, not the test package's manifest. Declaring `@vitest/snapshot` directly makes the matcher's runtime import a declared, version-pinned devDependency of the package that calls it, so a layout change or future `vitest` bump cannot silently fork snapshot state between the runner's client and the matcher ("The snapshot state for '<file>' is not found. Did you call 'SnapshotClient.setup()'?").

### Problem Frame

CI on the remove-babel branch failed with the state-not-found error for the FalseCJS recipe while the other fifteen recipes in the same file passed (check-run annotation 99059047682, stack: `@vitest+snapshot@4.1.10/.../index.js:948:10` in `toMatchFileSnapshotImpl`, vitest 4.1.10). That failure came from two physical vitest installs — the esbuild peer fork of issue #304 — now fixed on main by the esbuild override (PR #305); main resolves one `vitest@4.1.10` and one `@vitest/snapshot@4.1.10` (`pnpm-lock.yaml:13556` shows vitest's own dependency on the snapshot package). The declaration gap is the residue: the matcher's direct use resolves transitively rather than from the importer's manifest, so any future vitest fork or bump can re-fork snapshot state silently. Same error class is documented upstream in pnpm monorepos as duplicate `@vitest/snapshot`/vitest instances forking `SnapshotClient` state (vitest-dev/vitest#7668, #7430, #7322).

### Requirements

- R1. Every owned package — under `packages/`, `omp/`, `agent-plugins/` — whose tests call a vitest snapshot matcher (`toMatchSnapshot`, `toMatchInlineSnapshot`, `toMatchFileSnapshot`) declares `@vitest/snapshot` in its manifest. Today exactly one package does: `packages/testing/type-testing/arethetypeswrong/analysis` (`snapshots.integration.test.ts:45` is the only owned matcher call site; verified by grep this session).
- R2. `@vitest/snapshot` is declared at the catalog pin (`catalog:`), never a one-off absolute version, and the workspace catalog's `@vitest/snapshot` entry carries the same range as `vitest` (`^4.1.10`) so one install run resolves both to the same version.
- R3. The native `toMatchFileSnapshot` matcher stays in `snapshots.integration.test.ts`; the read-and-compare workaround (commit `ea59847`) does not reappear.
- R4. `pnpm install --frozen-lockfile` succeeds on the changed tree, and `pnpm --filter @systemfsoftware/arethetypeswrong ls @vitest/snapshot vitest` reports one shared physical instance.
- R5. The analysis snapshot suite passes on a fresh install (cold worktree or CI, no turbo cache); a single warm local run is not sufficient.

### Scope Boundaries

- **Deferred to follow-up work:** a standing auto-guard that rejects a package using snapshot matchers without declaring `@vitest/snapshot` — the issue's acceptance criteria are one-shot verification greps, and no existing check chain reads external `@vitest/*` imports (knip sees only the test file's own imports, which name `vitest`, not `@vitest/snapshot`). Naming the gap now keeps the fix minimal; a guard can be a later issue if the pattern spreads.
- **Outside this product's identity:**
  - The `@vitest/browser-playwright` worker-context breakage on vitest 4.1.11 (suite-state and `describe`-config errors) — a separate undeclared-import bug in a wider graph; the issue directs isolating and reporting it to vitest-dev/vitest separately, not fixing it here.
  - Bumping `vitest`'s version to dedupe — a substitute for declaring, explicitly rejected by the issue.
  - pnpm `overrides` entries or editing `@vitest/*` internals — both rejected by the issue's boundaries.
  - Removing the native matcher again.

## Planning Contract

### Key Technical Decisions

- KTD1. Declare `@vitest/snapshot` in the manifest of every owned package that calls a snapshot matcher; today that is one manifest — `packages/testing/type-testing/arethetypeswrong/analysis/package.json` (`devDependencies`). An undeclared direct import resolves from whoever happens to provide it — today vitest's own transitive dependency, on another branch a sibling-pinned copy — so the test package has no say over the snapshot instance it calls. A declared dependency makes the import resolve from the importer's own manifest and pins one instance. This is not observable as a resolution change on main today (one physical copy already exists); it pins resolution so a layout change or `vitest` bump cannot fork it. The repo's existing pattern is that a package which runs tests declares the test-runner stack it actually imports (`packages/toolchain/vitest-config/package.json` declares `vitest: catalog:` as the shared pattern).
- KTD2. Add `"@vitest/snapshot": "^4.1.10"` to the root `catalog:` block of `pnpm-workspace.yaml` directly beside `vitest: ^4.1.10`, and reference it as `catalog:`. Equal ranges keep the two packages on one resolution line, so any future `vitest` bump moves `@vitest/snapshot` with it, and the issue's "same resolved version" criterion holds by construction rather than by a one-off pin.

### Assumptions

- Main's catalog pins `vitest: ^4.1.10` (`pnpm-workspace.yaml:19`); the lockfile today resolves a single `vitest@4.1.10` and a single `@vitest/snapshot@4.1.10`, so `catalog:` for both yields the same instance without further moves.
- Snapshot fixture files under `analysis/tests/__fixtures__/snapshots/*.json` are already present and committed, so the CI run compares rather than auto-creates (the matcher refuses creation under `CI=true`).

## Implementation Units

### U1. Declare @vitest/snapshot at the catalog pin

- **Goal:** The analysis package manifest and the workspace catalog declare `@vitest/snapshot` at the vitest-matching range, and the lockfile records the analysis package as a consumer of the single snapshot instance.
- **Files:**
  - `pnpm-workspace.yaml` — add `"@vitest/snapshot": "^4.1.10"` to the root `catalog:` block beside `vitest: ^4.1.10`.
  - `packages/testing/type-testing/arethetypeswrong/analysis/package.json` — add `"@vitest/snapshot": "catalog:"` to `devDependencies`.
  - `pnpm-lock.yaml` — regenerated by `pnpm install` after the manifest edits; importer `packages/testing/type-testing/arethetypeswrong/analysis` gains an `@vitest/snapshot` devDependency edge.
  - `.changeset/` intent: `pnpm change --bump none @systemfsoftware/arethetypeswrong` — deterministic, not conditional: the gate keys on the turbo `build` hash and build inputs include `package.json` (`turbo.json:16-22`), so touching the published package's manifest demands intent; `none` is the canonical class for a devDependency-only change (REPO-R2).
- **Approach:** Make the two manifest edits, then run `pnpm install` so the lockfile reflects the new importer edge and the `@vitest/snapshot` resolution stays at 4.1.10, then commit lockfile and intent. `pnpm install --frozen-lockfile` is the consistency gate on the committed tree — it never writes a lockfile, so it must run after the regeneration, never instead of it.
- **Test expectation:** none — `[reason: dependency-declaration/config change; the behavioral contract (snapshot suite green, one shared instance) is carried by the Verification Contract gates, which are stricter than any unit test here]`.
- **Verification:**
  - `pnpm install --frozen-lockfile` exits 0 on the changed tree (after the lockfile is regenerated and committed).
  - `CI=true pnpm --filter @systemfsoftware/arethetypeswrong exec vitest run tests/snapshots.integration.test.ts` exits 0.
  - `pnpm --filter @systemfsoftware/arethetypeswrong ls @vitest/snapshot vitest` reports one shared instance.
  - `git grep -l 'toMatch(File|Inline)?Snapshot' packages omp agent-plugins` lists exactly `packages/testing/type-testing/arethetypeswrong/analysis/tests/snapshots.integration.test.ts`, and its manifest declares `@vitest/snapshot`.

## Verification Contract

| Gate                                        | Command                                                                                                                                                     | Applies to                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Frozen-lockfile install                     | `pnpm install --frozen-lockfile` — must run after `pnpm install` regenerates and commits the lockfile; frozen never writes                                  | U1, R4                                                                                                                |
| Analysis snapshot suite with native matcher | `CI=true pnpm --filter @systemfsoftware/arethetypeswrong exec vitest run tests/snapshots.integration.test.ts`                                               | U1, R3, R5                                                                                                            |
| One shared snapshot instance                | `pnpm --filter @systemfsoftware/arethetypeswrong ls @vitest/snapshot vitest` — a single physical copy each                                                  | U1, R2                                                                                                                |
| Matcher-usage ↔ manifest census             | `git grep -l 'toMatch(File                                                                                                                                  | Inline)?Snapshot' packages omp agent-plugins`matches only the analysis test; that manifest declares`@vitest/snapshot` |
| Workaround absent                           | `snapshots.integration.test.ts` contains `toMatchFileSnapshot`, no custom read-and-compare block                                                            | R3                                                                                                                    |
| Repo gate                                   | `pnpm check:local` exits 0 after the last edit (REPO-D1); the changeset gate (`.github/workflows/changeset-check.yml`) decides intent by turbo hash verdict | U1, repo DoD                                                                                                          |

## Definition of Done

- All four issue acceptance criteria (AC1–AC4) green, verified by the gates above on a cold-worktree or CI fresh install after the last edit (`pnpm check:local` exits 0).
- One physical `@vitest/snapshot` instance shared with `vitest` in the analysis package's resolution.
- Native `toMatchFileSnapshot` in place; no read-and-compare block.
- No abandoned-attempt code expected — the change is two manifest lines plus a regenerated lockfile; leftover workaround code anywhere in the diff is a cleanup failure, not a done state (CONST-S4).
- Work delivered as a pull request on branch `gh-386`, watched to green (REPO-D1, REPO-D2).
