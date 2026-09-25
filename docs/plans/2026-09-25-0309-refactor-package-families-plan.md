---
title: Package Families - Plan
type: refactor
date: 2026-09-25
topic: package-families
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
supersedes: docs/plans/2026-09-25-0242-refactor-package-families-plan.md
execution: code
---

# Package Families - Plan

## Goal Capsule

- **Objective:** A reader who opens `packages/` sees which packages ship as one product family, and every tool that finds a package by its path still finds the same set.
- **Means:** Move 22 of the 30 loose packages into six one-level family folders; the other 8 stay flat.
- **Product Authority:** The dialogue decisions below, root `AGENTS.md` (REPO-S4, REPO-R2, REPO-D1), and the name-equal directory invariant from PR #357. Directory placement only; code, npm names, and the four existing group folders are not active scope.
- **Open Blockers:** None.

---

## Product Contract

### Summary

Six family folders under `packages/`: `daemon/`, `schema/`, `sim/`, `gherkin/`, `trace/`, and `runner/`. Each holds an anchor package and the packages that build on it, with private test suites beside their subject. Packages with no family stay at `packages/<name>`.

### Problem Frame

`packages/` holds 30 loose package directories beside four group folders (`atom/`, `oxlint-plugin/`, `oxlint-presets/`, `toolchain/`). Families that ship together, such as the six daemon packages or the six schema packages, are scattered alphabetically among unrelated ones.

An earlier attempt (`docs/plans/2026-08-20-001-refactor-packages-folder-structure-plan.md`) nested every package into role tiers (`core/`, `testing/`, `lint/`). PR #357 (commit `02c393fcf48`) reverted it to name-equal directories. That move also left mutation-matrix discovery enrolling 0 of 14 targets without an error, because a trigger was still keyed on a vacated path.

### Key Decisions

- **Folders mean product families, not architectural roles.** A role tier splits one family across runtime and testing folders, and the role hierarchy was already reverted once. (session-settled: user-directed — chosen over role folders (runtime/testing/lint): families mirror the dependency graph.) Governs R1.
- **No grab-bag folders.** A folder named for a vibe (`core/`, `sandbox/`) groups packages that share nothing a reader can check. (session-settled: user-directed — chosen over a `core/` folder and a `sandbox/` folder of test substrates: members shared a theme, not a family.) Governs R6.
- **Packages without a family stay flat.** (session-settled: user-directed — chosen over forcing every package into a folder or allowing single-member folders: a loner has no family to name.) Governs R2.
- **`toolchain/` and the other existing groups stay as they are.** (session-settled: user-directed — chosen over merging test harnesses into `toolchain/` or adding a sibling role folder beside it.) Governs R3.
- **The test harnesses split by dependency spine into `sim/`, `gherkin/`, `trace/`, and `runner/`.** A single `spec/` folder of 11 packages would repeat the looseness rejected for `core/`. `effect-spec-runtime` stays flat because both `gherkin/` and `trace/` build on it. (session-settled: user-approved — chosen over one `spec/` folder and over a mechanical name-stem rule.) Governs R1, R2.
- **The runner family folder is `runner/`, not `vitest/`.** `oxlint-plugin-test-discipline` exempts any path with a directory segment named `vitest` from the lawful-runner import rule (`isRawVitestPackage`), so a `vitest/` family folder would silently exempt every future member. Renaming changes nothing outside this repo; tightening the published rule would change what adopters run. Governs R1, R6.

### Requirements

**Family layout**

- R1. Each family folder holds exactly these packages:

| Folder              | Members                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/daemon/`  | `effect-daemon-spec`, `effect-daemon-conformance`, `effect-daemon-cluster`, `effect-daemon-process`, `effect-daemon-socket`, `effect-daemon-microvm` |
| `packages/schema/`  | `effect-schema-discovery`, `effect-schema-extensions`, `effect-schema-law`, `effect-schema-recursion-budget`, `effect-schema-vite`, `hex-schema`     |
| `packages/sim/`     | `effect-sim-kernel`, `effect-sim-kernel-tests`, `conformance-spec`, `differential-spec`                                                              |
| `packages/gherkin/` | `effect-gherkin-spec`, `storybook-gherkin`                                                                                                           |
| `packages/trace/`   | `trace-spec`, `trace-taxonomy`                                                                                                                       |
| `packages/runner/`  | `vitest`, `vitest-conformance`                                                                                                                       |

- R2. These packages stay at `packages/<name>`: `effect-cell-types`, `discern`, `rx-effect`, `npm-package`, `effect-memfs`, `effect-readiness`, `effect-microsandbox`, `effect-spec-runtime`.
- R3. `packages/atom/`, `packages/oxlint-plugin/`, `packages/oxlint-presets/`, and `packages/toolchain/` keep their members and paths.
- R4. Every package directory's basename stays equal to its unscoped npm name, and no npm package is renamed.
- R5. A private suite lives in the same family folder as the package it tests.

**Admission rule**

- R6. A family folder exists only for two or more packages that share one named concept and build on an anchor inside the folder. A package consumed by more than one family stays flat, and a family folder is never named after a directory segment a path-matching rule treats specially. Root doctrine states this rule so new packages follow it, and review is its gate.

**Path consumers**

- R7. Every consumer that locates a package by path follows the move in the same change: workspace globs, each manifest's `repository.directory`, CI workflow path filters, live docs, and README links. `differential-spec`, which has no `repository.directory` today, gains one.
- R8. Every path-selecting tool selects the same package set after the move as before. That includes mutation-target discovery, CI test routing, `pnpm map`, and the changeset guard. A tool that silently selects fewer packages after the move is a failure, not a pass.
- R9. The release pipeline still plans, versions, and resolves changelogs for every package after the move, including versions owed from before it.

**Release**

- R10. The move ships a `none` change intent for every moved publishable package, because only manifest metadata changes for consumers.

### Success Criteria

- `pnpm map` lists the same package count before and after, with every moved package at its R1 path.
- Mutation-target discovery over the full lockfile returns the same package set before and after, with paths rewritten.
- `pnpm check:local` exits 0 and the pull request's checks pass.

### Scope Boundaries

- Renaming any npm package, or changing directory basenames away from npm names.
- Changing members or layout of `atom/`, `oxlint-plugin/`, `oxlint-presets/`, or `toolchain/`.
- Nesting deeper than `packages/<family>/<name>`.
- Family-level `AGENTS.md` files; a family earns one only when it has rules of its own.
- An automated gate for R6.
- Rewriting `dir:` entries in `.changeset/ledger.yaml`. Changelog resolution keys on `name@version` (`scripts/tools/cycle.ts`, `ensureChangelog`), so the recorded directory is history, not a lookup key.

### Sources / Research

- `pnpm-workspace.yaml` — current globs: `packages/*` plus one line per group folder.
- `scripts/tools/workspace-map.ts` — `pnpm map` reads `<dir>/*` globs, so one-level family folders need a glob line each.
- `scripts/tools/discover-mutation-targets.mjs` — targets come from lockfile importers, plus a hardcoded `packages/toolchain/stryker-config/` prefix.
- `.github/workflows/storybook-gherkin-browser.yml` — the only workflow path filter naming a package that moves.
- The `ports` option of `@systemfsoftware/oxlint-plugin-effect-platform`'s recommended config — a path-matched consumer that R7 covers; stale entries would turn moved ports into lint findings.
- Commit `02c393fcf48` (PR #357) — the name-equal directory invariant and the silent 0-of-14 discovery failure.
