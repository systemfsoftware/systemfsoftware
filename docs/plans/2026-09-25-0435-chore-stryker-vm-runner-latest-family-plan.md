---
title: Latest Stryker Family on the vm Runner - Plan
type: chore
date: 2026-09-25
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Latest Stryker Family on the vm Runner - Plan

## Goal Capsule

- **Objective:** Mutation testing in this repo runs on the newest published `@systemfsoftware/*` toolchain, and every mutated package's suites run through stryker-js's in-process `vm` runner instead of the spawned Vitest plugin runner.
- **Means:** bump `catalogs.stryker` to the latest releases (KTD1) and point all 14 `stryker.config.ts` files at `testRunner: 'vm'` (KTD2), restructuring `effect-atom`'s Vitest config so its default config is browser-free (KTD3).
- **Authority:** user direction in the invoking conversation > this plan > repo convention.
- **Stop conditions:** a vm dry run cannot load a package's suites for a reason the repo cannot fix (harness defect in the published `@systemfsoftware/stryker-vm-harness`); stop and report instead of reverting that package to the plugin runner.
- **Execution profile:** config and manifest work; proof is install, typecheck, the package test suites, and a per-package vm dry run.
- **Finish and ship:** `lfg` pipeline — implement, review, PR, CI watch.

---

## Product Contract

### Summary

Move the `catalogs.stryker` entries to their latest releases and switch every package's Stryker test runner to the built-in `vm` runner. Remove the `@systemfsoftware/stryker-js-vitest-runner` plugin from the workspace once nothing uses it.

### Problem Frame

The workspace pins stryker-js 10.1.x while 11.0.0 is published, and every package runs mutants through the Vitest plugin runner, which spawns a child Vitest per test runner. stryker-js 10.1.2+ ships an in-process `vm` runner (worker thread plus module hooks, `@systemfsoftware/stryker-vm-harness`) that the owner wants used everywhere. The other registry-consumed family entry, `@systemfsoftware/arethetypeswrong-cli` `^4.2.0`, is already the latest release; every other `@systemfsoftware/*` dependency is `workspace:`-linked.

### Key Decisions

- **Latest family releases, stryker included.** (session-settled: user-directed — chosen over keeping the current `catalogs.stryker` ranges: the owner wants the workspace on the newest published toolchain.) Governs R1, R2.
- **vm runner for every Stryker config.** (session-settled: user-directed — chosen over keeping the `@systemfsoftware/stryker-js-vitest-runner` plugin: the owner wants the in-process `node:vm`-style runner.) Governs R3, R4, R5.

### Requirements

**Dependency versions**

- R1. `catalogs.stryker` in `pnpm-workspace.yaml` resolves `@systemfsoftware/stryker-js` 11.0.0, `stryker-js-typescript-checker` 7.1.0, `stryker-test-contribution` 4.0.0, and the two ignorers at 0.1.1, and the lockfile records those resolutions.
- R2. No `@systemfsoftware/*` registry dependency in the workspace is behind its npm `latest` dist-tag after the change.

**Runner**

- R3. Every Stryker config in the workspace resolves `testRunner: 'vm'`; none references `@systemfsoftware/stryker-js-vitest-runner`.
- R4. Each of the 14 mutated packages completes a Stryker dry run on the vm runner with the same test files its current Stryker run selects.
- R5. `@systemfsoftware/stryker-js-vitest-runner` is gone from every workspace manifest and from `catalogs.stryker`.

**Unchanged behaviour**

- R6. `effect-atom`'s `pnpm test` still runs both its node and browser suites.

### Scope Boundaries

- The Mutation CI workflow, `scripts/tools/discover-mutation-targets.mjs`, and `scripts/tools/build-mutation-summary.ts` stay untouched; they are runner-agnostic (Evaluator surfaces).
- No change to mutate globs, thresholds, checkers, ignorers, or the `stryker-test-contribution` plugin wiring.

### Deferred to Follow-Up Work

- `packages/schema/hex-schema` declares the stryker catalog devDependencies and a `mutation` script but has no `stryker.config.ts`. Only its vitest-runner entry is removed here (R5); pruning the rest is separate cleanup.
- stryker-js's vm runner does not forward a Vitest `configFile` although the harness session accepts one. Exposing it would let `effect-atom` keep a combined config; that change belongs in the stryker-js-effect repo.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Bump through the catalog only.** Edit `catalogs.stryker` ranges to the latest majors (`^11.0.0`, `^7.1.0`, `^4.0.0`) and let `pnpm install` refresh the lockfile; consumers already reference `catalog:stryker`. `minimumReleaseAgeExclude: ["@systemfsoftware/*"]` already admits same-day own-org releases (`docs/solutions/tooling-decisions/root-workspace-protocol-hashes-every-task.md`). stryker-js 11.0.0's only listed change is a patch fix; 10.x→11 keeps `defineConfig` and the `StrykerConfig` type on `@systemfsoftware/stryker-js/config`. test-contribution 4.0.0 only makes the `effect` peer optional. (session-settled: user-directed — chosen over keeping current ranges: newest toolchain wanted.)
- KTD2. **`testRunner: 'vm'` lives once, in the shared Stryker base.** All 14 packages spread `sharedConfig` from `packages/toolchain/stryker-config/lib/base.js`, and after the switch every one would carry the identical runner value, so set `testRunner: 'vm'` there and delete each package's `testRunner` block. Leave `testFiles` unset, so stryker discovers `**/*.{test,spec}.*` and the harness resolves the package's default `vitest.config.*` (projects, `includeSource`, setup files, `inlineSchemaTests()` plugin included). A package sets `testFiles` only when its dry run shows the discovered set differs from what its Vitest config selects. `related: true` is dropped: it is a plugin option, and `coverageAnalysis: 'perTest'` in the shared base already restricts each mutant to its covering tests. Rejected: `'vm'` repeated in 14 package configs (one rule, fourteen copies). (session-settled: user-directed — chosen over keeping the Vitest plugin runner: the owner wants the in-process vm runner.)
- KTD3. **Make `effect-atom`'s default Vitest config node-only.** The vm runner refuses any resolved config with a browser-mode project and cannot be pointed at `vitest.node.config.ts`. Move the node project into `vitest.config.ts`, move the browser project to `vitest.browser.config.ts`, and chain both in the package `test` script so R6 holds. Rejected: keeping `effect-atom` on the plugin runner (contradicts the settled runner decision); an env-gated browser project inside one config (hidden mode switch in test infrastructure).
- KTD4. **Delete the vitest-runner plugin dependency outright.** With no config referencing it, the devDependency in each manifest and the catalog entry are dead; remove them in the same change (clean cutover).
- KTD5. **Changeset intent is `none`.** Only devDependencies and Stryker/Vitest config change; nothing ships to consumers. Author one intent via `pnpm change --bump none` naming every publishable package whose build hash moves (`docs/solutions/build-errors/changeset-gate-transitive-build-hash.md`).

### Assumptions

- The published harness supports every Vitest feature these suites use (projects, `includeSource`, `setupFiles`, `globalSetup`, Vite plugins); R4's dry runs are the check.
- stryker-js ≥9 discards an incremental file whose `incrementalVersion` differs from the running version, so no manual cache invalidation is needed after the bump.
- A Stryker `--dryRunOnly` run executes the suite once and tests no mutants, so it is not the local mutation run REPO-D3 forbids. It runs one package at a time through the stryker-js promises API from a throwaway script, never in parallel.
- No permanent tests are admitted: every change is dependency or configuration wiring (composition-root altitude), whose proof is a smoke run, not a test file.

### Risks

| Risk                                                                                                                                 | Mitigation                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect-daemon-microvm`'s contract project has a KVM `globalSetup` and a 900 s timeout that the harness may apply during the dry run | The contract project already skips without KVM in plain `vitest run`; the dry run shows whether the harness does the same. If it hangs, narrow with `testFiles` to unit tests, matching what CI mutates today. |
| Losing `related: true` raises per-mutant test cost                                                                                   | `perTest` coverage analysis already limits each mutant to covering tests; CI Mutation workflow timings show the effect.                                                                                        |
| In-source tests (`import.meta.vitest`) are not matched by the discovered `*.test.*` glob                                             | Dry-run test counts per package are compared with the current plugin-runner selection (R4); set `testFiles` where the counts diverge.                                                                          |

---

## Implementation Units

### U1. Bump the stryker catalog

- **Goal:** latest `@systemfsoftware/*` stryker family resolved in the workspace.
- **Requirements:** R1, R2; KTD1.
- **Dependencies:** none.
- **Files:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Approach:**
  1. Set `catalogs.stryker` ranges to `^11.0.0` (stryker-js), `^7.1.0` (typescript-checker), `^4.0.0` (test-contribution); ignorers stay `^0.1.1`.
  2. Run one non-frozen install to refresh the lockfile.
  3. Recheck every `@systemfsoftware/*` registry range against npm `latest` (R2).
- **Test expectation:** none -- dependency pins; proven by install and U2's dry runs.
- **Verification:** `pnpm install --frozen-lockfile` exits 0 and the lockfile resolves `@systemfsoftware/stryker-js@11.0.0`.

### U2. Move the runner into the shared base and switch the 13 straightforward packages

- **Goal:** the shared Stryker base selects `testRunner: 'vm'`, and every package except `effect-atom` inherits it.
- **Requirements:** R3, R4; KTD2.
- **Dependencies:** U1.
- **Files:** `packages/toolchain/stryker-config/lib/base.js`, `packages/toolchain/stryker-config/lib/base.d.ts`, and `stryker.config.ts` in `packages/daemon/effect-daemon-{cluster,conformance,microvm,process,socket,spec}`, `packages/effect-microsandbox`, `packages/effect-readiness`, `packages/oxlint-plugin/oxlint-plugin-{cell-architecture,dmmf-workflow,effect-platform,effect-schema,test-discipline}`.
- **Approach:**
  1. Add `testRunner: 'vm'` to `sharedConfig` and its declaration.
  2. Delete the `testRunner` block from each listed package config; keep checkers, ignorers, plugins, mutate, and thresholds.
- **Execution note:** smoke-first; each package's vm dry run is the proof, compared against the test count its current Vitest config selects.
- **Test scenarios:**
  - A package whose Vitest config has `includeSource` (effect-readiness): its dry run reports in-source tests as well as `*.test.ts` tests.
  - A package whose Vitest config has projects (effect-daemon-process): unit-project tests run; conformance and contract projects behave as in `pnpm test`.
  - `effect-daemon-microvm` on a host without KVM: the dry run completes without hanging on the contract project.
- **Verification:** each package typechecks, its `pnpm test` passes, and its vm dry run reports "Initial test run succeeded" with a test count matching its Vitest run.

### U3. Split effect-atom's Vitest config and switch it

- **Goal:** `effect-atom` runs its node suites on the vm runner while `pnpm test` keeps the browser suite.
- **Requirements:** R3, R4, R6; KTD3.
- **Dependencies:** U1.
- **Files:** `packages/atom/effect-atom/vitest.config.ts` (becomes the node project), `packages/atom/effect-atom/vitest.node.config.ts` (deleted; its settings move into `vitest.config.ts`), `packages/atom/effect-atom/vitest.browser.config.ts` (new; browser project), `packages/atom/effect-atom/package.json` (`test` script), `packages/atom/effect-atom/tsconfig.node.json`, `packages/atom/effect-atom/stryker.config.ts`.
- **Approach:**
  1. `vitest.config.ts` becomes the node project (current `nodeTest` settings, `inlineSchemaTests()`, coverage block).
  2. `vitest.browser.config.ts` holds the browser project.
  3. The `test` script runs the node config and then the browser config; `test:watch` keeps the node config.
  4. `tsconfig.node.json` lists the renamed config files.
  5. `stryker.config.ts` drops its `testRunner` block and inherits `'vm'` from the shared base.
- **Test scenarios:**
  - `pnpm --filter @systemfsoftware/effect-atom test` runs node and browser tests with the same totals as before the split.
  - The vm dry run loads without the browser-mode refusal and reports only node tests.
- **Verification:** package test, typecheck, and lint pass; vm dry run succeeds.

### U4. Remove the vitest-runner plugin from the workspace

- **Goal:** no dead dependency on `@systemfsoftware/stryker-js-vitest-runner`.
- **Requirements:** R5; KTD4.
- **Dependencies:** U2, U3.
- **Files:** the 15 `package.json` files that declare it (the 14 mutated packages plus `packages/schema/hex-schema`), `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Approach:** delete the devDependency lines and the catalog entry, then refresh the lockfile once.
- **Test expectation:** none -- manifest removal; proven by frozen install and a clean text search.
- **Verification:** no workspace file outside `docs/` and `.changeset/` names `stryker-js-vitest-runner`; frozen install exits 0.

### U5. Docs and change intent

- **Goal:** repo docs describe the current catalog and runner; the release gate has its intent.
- **Requirements:** R1, R3; KTD5.
- **Dependencies:** U1–U4.
- **Files:** `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md` (catalog example), any `AGENTS.md` or README in the touched packages that names the plugin runner, `.changeset/<new>.md`.
- **Approach:** update the worked catalog example and runner mentions to current fact; create the `none` intent through `pnpm change`.
- **Test expectation:** none -- documentation and release metadata.
- **Verification:** the changeset gate script accepts the intent; docs name no removed package as current.

---

## Verification Contract

| Check                  | Command or evidence                                                                                                                                     | Proves                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Lockfile consistent    | `pnpm install --frozen-lockfile`                                                                                                                        | R1, R5                                             |
| Local gate             | `pnpm check:local`                                                                                                                                      | typecheck, lint, tests across touched packages, R6 |
| vm dry run per package | throwaway script calling `run()` from `@systemfsoftware/stryker-js/promises` with `dryRunOnly: true`, one package at a time, from the package directory | R3, R4                                             |
| No plugin references   | text search for `stryker-js-vitest-runner` outside `docs/` and `.changeset/` returns nothing                                                            | R5                                                 |
| CI                     | PR checks green; Mutation workflow (advisory) reports on the vm runner                                                                                  | R4 in CI                                           |

## Definition of Done

- R1–R6 hold, each proven by the Verification Contract row that names it.
- The throwaway dry-run script and any `reports/` or `.stryker-tmp/` output it produced are deleted.
- One `none` change intent exists and `pnpm check:local` exits 0 after the last edit.
