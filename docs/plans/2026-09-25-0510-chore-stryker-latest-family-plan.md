---
title: Latest Stryker Family - Plan
type: chore
date: 2026-09-25
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
supersedes: docs/plans/2026-09-25-0435-chore-stryker-vm-runner-latest-family-plan.md
---

# Latest Stryker Family - Plan

Supersedes `docs/plans/2026-09-25-0435-chore-stryker-vm-runner-latest-family-plan.md`. That plan's stop condition fired: the published `@systemfsoftware/stryker-vm-harness` 3.0.0 cannot run 11 of the 14 mutated packages, so the owner chose to ship the toolchain bump now and move to the `vm` runner once the upstream fixes ship.

## Goal Capsule

- **Objective:** mutation testing in this repo runs on the newest published `@systemfsoftware/*` Stryker toolchain, on the Vitest plugin runner it uses today.
- **Means:** bump `catalogs.stryker` to the latest releases (KTD1) and move the 14 `stryker.config.ts` files to stryker-js 11's config API (KTD2).
- **Authority:** user direction in the invoking conversation > this plan > repo convention.
- **Stop conditions:** a package's Stryker dry run fails on the bumped toolchain where it passed before.
- **Execution profile:** config and manifest work; proof is install, typecheck, and a per-package Stryker dry run.
- **Finish and ship:** `lfg` pipeline — implement, review, PR, CI watch.

---

## Product Contract

### Summary

Move `catalogs.stryker` to the latest releases and adapt every Stryker config to the stryker-js 11 config API. The runner stays `@systemfsoftware/stryker-js-vitest-runner`.

### Problem Frame

The workspace pins stryker-js 10.1.x while 11.0.0 is published. stryker-js 11.0.0 removed `defineConfig` from `@systemfsoftware/stryker-js/config` and changed what the `StrykerConfig` type means, so every config in the repo fails to load on 11.0.0 unchanged (systemfsoftware/stryker-js-effect#104; the 11.0.0 CHANGELOG does not mention it).

The in-process `vm` runner was the other half of the owner's request. Dry runs of all 14 packages on harness 3.0.0 found upstream defects, each filed in systemfsoftware/stryker-js-effect:

- #105 — the vm harness looks for itself from the project directory, so pnpm projects must add it as a direct dependency.
- #106 — `import.meta.vitest` is rewritten inside string literals, so test-discipline has 59 false failures and effect-schema has 3.
- #107 — `passWithNoTests` is ignored, so test-discipline has 12 false failures.
- #108 — setup files outside the package get a `vitest` with no runner. Every guard-carrying package stops at `init-failed`: effect-atom, the six daemon packages, effect-microsandbox and effect-readiness.

Only cell-architecture, dmmf-workflow and effect-platform pass on it today.

### Key Decisions

- **Latest family releases, stryker included.** (session-settled: user-directed — chosen over keeping the current `catalogs.stryker` ranges: the owner wants the newest published toolchain.) Governs R1, R2.
- **Stay on the Vitest plugin runner until the harness fixes ship.** (session-settled: user-directed — chosen over switching only the three packages that pass today, and over holding the bump until upstream fixes land.) Governs R3.

### Requirements

- R1. `catalogs.stryker` resolves `@systemfsoftware/stryker-js` 11.0.0, `stryker-js-typescript-checker` 7.1.0, `stryker-js-vitest-runner` 7.2.0, `stryker-test-contribution` 4.0.0, and the two ignorers at 0.1.1; the lockfile records those resolutions.
- R2. No `@systemfsoftware/*` registry dependency in the workspace is behind its npm `latest` dist-tag.
- R3. Every `stryker.config.ts` loads on stryker-js 11 and keeps its current runner, checkers, ignorers, plugins, mutate globs and thresholds; each of the 14 mutated packages completes a Stryker dry run.

### Scope Boundaries

- The Mutation CI workflow and its scripts stay untouched (Evaluator surfaces).
- The `vm` runner switch is out of scope here.

### Deferred to Follow-Up Work

- Switch every package to `testRunner: 'vm'` once #105–#108 ship; `effect-atom` also needs a browser-free default Vitest config, since the vm runner refuses browser mode.
- If #104 restores `defineConfig`/`mergeConfig`, the configs may move back to them.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Bump through the catalog only.** Consumers already reference `catalog:stryker`; `minimumReleaseAgeExclude: ["@systemfsoftware/*"]` admits same-day own-org releases.
- KTD2. **Adopt `StrykerConfig.define` with a `PartialStrykerOptions` annotation.** On 11.0.0, `./config` exports only the `StrykerConfig` class (`define`, `merge`) plus types; `StrykerConfig` as a type is the class instance, so the annotation that keeps composite declarations portable (TS2883) moves to `PartialStrykerOptions`.

### Assumptions

- A Stryker `dryRunOnly` run executes the suite once and tests no mutants, so it is not the local mutation run REPO-D3 forbids. It runs one package at a time from a throwaway script.
- No permanent tests are admitted: every change is dependency or config wiring, proven by a dry run.

---

## Implementation Units

### U1. Bump the stryker catalog

- **Goal:** latest stryker family resolved in the workspace.
- **Requirements:** R1, R2; KTD1.
- **Files:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Verification:** `pnpm install --frozen-lockfile` exits 0; the lockfile resolves the R1 versions.

### U2. Move configs to the stryker-js 11 config API

- **Goal:** every `stryker.config.ts` loads on stryker-js 11.
- **Requirements:** R3; KTD2.
- **Files:** the 14 `stryker.config.ts` files.
- **Verification:** each package typechecks; each package's Stryker dry run reports "Initial test run succeeded".

### U3. Change intent

- **Goal:** the release gate has its intent.
- **Files:** `.changeset/<new>.md`.
- **Verification:** the changeset gate accepts it.

---

## Verification Contract

| Check               | Command or evidence                                                                                  | Proves |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| Lockfile consistent | `pnpm install --frozen-lockfile`                                                                     | R1     |
| Latest family       | `npm view <pkg> version` for each `@systemfsoftware/*` registry range                                | R2     |
| Dry run per package | throwaway script calling `run()` from `@systemfsoftware/stryker-js/promises` with `dryRunOnly: true` | R3     |
| Local gate          | `pnpm check:local`                                                                                   | R3     |
| CI                  | PR checks green                                                                                      | R3     |

## Definition of Done

- R1–R3 hold, each proven by its Verification Contract row.
- The throwaway dry-run scripts and any `reports/` or `.stryker-tmp/` output are deleted.
- One change intent exists and `pnpm check:local` exits 0 after the last edit.
