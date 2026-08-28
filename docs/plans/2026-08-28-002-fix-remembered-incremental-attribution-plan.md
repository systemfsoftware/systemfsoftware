---
title: fix: remembered incremental verdicts keep kill attribution
created: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
topic: remembered-incremental-attribution
issue: https://github.com/systemfsoftware/systemfsoftware/issues/283
---

# fix: remembered incremental verdicts retain kill attribution

## Goal Capsule

- **Objective.** A mutation run in incremental mode emits, for every mutant verdict it reuses, the same `killedBy` and `coveredBy` attribution the prior run recorded, so a fully-remembered package's report is attribution-equivalent to a fresh run's and the contribution gate judges it instead of refusing.
- **Authority hierarchy.** Issue #283 acceptance criteria govern; repo invariants (`AGENTS.md` REPO-D1 `pnpm check:local`, REPO-R2 changeset gate, REPO-D3 no real mutation runs) govern the tail. This plan governs the proof: the acceptance gatekeeper and the contribution-gate acceptance scenario.
- **Stop conditions.** If the gatekeeper reddens on a reverted fix but current HEAD also reddens it — the attribution path is not actually live — stop and report the failing seam instead of weakening the scenario. If driving the reuse path requires a real Stryker mutation run on a package outside test fixtures, stop (REPO-D3).
- **Execution profile.** Test-only by default: PR #280 flowed the attribution fix into the tree (schema fields, `rememberedEntryOf`, `rememberedResultsOf`, report projection); the issue's remaining deliverable is the proof. If the gatekeeper exposes a genuine gap, the src fix lands in the same unit and a changeset is filed per REPO-R2.
- **Tail ownership.** Caller (LFG) owns simplify → review → commit → PR → CI watch.

---

## Product Contract

### Summary

Issue #283 reports blind kills on reused incremental verdicts: remembered mutants reached the report with `killedBy`/`coveredBy` dropped, so a fully-remembered package failed the test-contribution gate with the zero-attribution refusal instead of receiving a verdict. The fix already merged via PR #280 (commit `47e2a8d1dc6`): the differ's remembered-verdict schema and reconstruction now carry attribution (`packages/testing/mutation/stryker-js/platform-node/src/IncrementalDiff.workflow.ts:35-41,207-218`), the diff result interface carries it (`src/Mutants.ts:417-424`), the edge reconstruction copies it onto results (`src/Run.ts:208-236`), and the report projection remaps it (`src/Reporter.ts:1008-1036`). What the issue still requires is the gatekeeper: an end-to-end scenario proving the emitted report carries the attribution, red when the fix is reverted.

### Problem Frame

The reuse path structurally dropped attribution before #280: `IncrementalDiffResult.remembered` carried only `{ mutantId, status, testsCompleted }`, and the edge (`rememberedResultsOf`) rebuilt results from that projection — `killedBy`/`coveredBy` existed in the incremental file and in the decoded prior report but never survived into the emitted report. The contribution gate then correctly refused to judge: with no killer recorded anywhere, `judgeTestContribution` returns the zero-attribution refusal (`packages/testing/mutation/plugins/stryker-test-contribution/src/test-contribution.ts:139-146`) rather than accuse every file. The observed blast radius (issue evidence, run 33122844699 report 1354): 22 `Killed` mutants with `statusReason: "Remembered"` and no attribution; `stryker-js/cli` 9/9 kills blind.

The fix direction is settled and already merged; the remaining work is proving it per the issue's acceptance criteria.

### Requirements

- R1. The platform-node test suite carries a scenario that writes an incremental file whose `Killed` mutants carry `killedBy`, drives the reuse path, and asserts the emitted report carries the same attribution; reverting the fix's attribution copy reddens it (issue AC1, gatekeeper).
- R2. In any report produced with reuse, no `Killed` mutant has absent or empty `killedBy` unless the prior run's own record had none; a reused `Timeout` keeps today's unattributed semantics (issue AC2).
- R3. Reused verdicts remain distinguishable from fresh ones: `statusReason: "Remembered"` survives attribution restoration (issue AC3).
- R4. A run whose kills are all remembered and attributed passes the contribution gate — no zero-attribution refusal — when the prior run recorded killers (issue AC4).

### Scope Boundaries

- **In scope:** the platform-node reuse-path gatekeeper (`tests/`), the contribution-gate acceptance scenario (`packages/testing/mutation/plugins/stryker-test-contribution/tests/`), and any src fix the gatekeeper exposes.
- **Out of scope (with reason):** `force`/full re-execution as the fix (masks this run while every future reuse stays blind — a non-counting outcome); crediting remembered kills to a synthetic placeholder file or test id (moves the blindness without real attribution); dropping the `statusReason: "Remembered"` marker (merely makes reports look fresh — a non-counting outcome).
- **Never touched:** `repos/` (REPO-S3); no real Stryker mutation run outside in-repo fixtures (REPO-D3).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **The gatekeeper lives in the platform-node integration lane (in-process), not the cli container lane.** It drives the engine with a fixture project, a pre-seeded incremental file, and the builtin runner; the emitted report is read back from the written incremental file. Chosen over the cli-contract container lane: the reuse path's regression class is engine-internal, the issue models a test that writes the incremental file, and the container lane adds coupling without fidelity gain. The first run need not _produce_ attribution — it needs to _reuse_ a file that has it, the model the issue describes.
- KTD2. **Attribution is asserted on the emitted report, not on intermediate remembered entries.** The failing artifact is the report; the middle layers are already unit-covered by PR #280's in-source test (`Should_KeepKilledBy_When_BuildingARememberedEntry`). The gatekeeper must cross the seam: incremental file → differ → edge reconstruction → report projection. Assert via the incremental-file round-trip (KTD1's mechanism), plus `statusReason: "Remembered"` on the same mutants (R3).
- KTD3. **Test-only shipping; changeset only if a src fix surfaces.** Test and fixture edits do not move platform-node's turbo `build` hash (dist is source-derived), so REPO-R2 demands no intent for the proof alone. If the gatekeeper reddens on HEAD and a src edit is required to green it, file the changeset the gate flags. Never file a changeset for the test-only case.

### Sequencing

U1 (gatekeeper + fixture) → U2 (contribution-gate acceptance). U1's red-when-reverted proof is part of U1, run twice: against the working tree (green) and with the attribution copy deleted (red), then restored.

---

## Implementation Units

### U1. Reuse-path gatekeeper in platform-node tests

- **Goal:** prove R1, R2, R3 end to end: a written incremental file with `killedBy` drives the reuse path and the emitted report carries the same attribution, marked `statusReason: "Remembered"`, with revert-reddening.
- **Requirements:** R1, R2, R3.
- **Files:**
  - `packages/testing/mutation/stryker-js/platform-node/tests/remembered-attribution.integration.test.ts` (new)
  - `packages/testing/mutation/stryker-js/platform-node/tests/__fixtures__/reuse-project/` (new): minimal JS source + test command + `stryker.config.json`, mirrored from the cli lane's `minimal-project` fixture (`packages/testing/mutation/stryker-js/cli/tests/__fixtures__/fixtures/minimal-project/`)
  - possibly `packages/testing/mutation/stryker-js/platform-node/src/IncrementalDiff.workflow.ts` and/or `src/Run.ts` — only if the gatekeeper reddens on HEAD
- **Approach:**
  1. Build a fixture project with two mutants (mirror the cli lane's command-runner fixture; `coverageAnalysis: "off"`, builtin runner, `plugins: []`).
  2. Discover the fixture's real mutant keys: run the instrumenter on the fixture once (or a forced first Stryker run) and capture the emitted `mutatorName`, `replacement`, and `start`/`end` locations, because a mutant is only remembered when the seeded previous record's key matches the current mutant's key (`currentMutantKey` = mutatorName + replacement + shifted location — `src/IncrementalDiff.workflow.ts:63,130-153`). Hand-typing keys would make the diff re-run both mutants and the gatekeeper pass vacuously.
  3. Hand-author the incremental file per `IncrementalReportSchema` from the captured keys (`src/IncrementalReport.workflow.ts` decodes `files[].mutants[].killedBy/coveredBy`; the open rest preserves unknown keys). The file carries one `Killed` mutant with `killedBy: ['t1']` and `coveredBy: ['t1']`, one `Timeout` mutant with neither, and a `files[].source` matching the fixture's current source.
  4. Drive the reuse path: `runMutationTest` with `incremental: true`, `incrementalFile` pointing at the seeded file, `force: false`, fixture as cwd/basePath, per public API `makeRunLayer` + `RunEnvironment` (`src/index.ts` exports both; `src/Run.ts:1240` `runMutationTest`). The differ must classify both mutants as remembered (source unchanged, no changed tests, status in `REMEMBERED_STATUS` — `src/IncrementalDiff.workflow.ts:75,150-157`).
  5. Read back the incremental file the run wrote (`reportAll` writes it when `options.incremental`). Assert the `Killed` mutant is `status: "Killed"`, `killedBy: ['t1']`, `coveredBy: ['t1']`, `statusReason: "Remembered"` (R1, R3); the `Timeout` mutant emits with no `killedBy` (R2).
  6. Revert-proof: remove the attribution copy in `rememberedEntryOf` (`src/IncrementalDiff.workflow.ts:214-217`), re-run, and confirm the first scenario reddens; restore. If the final diff lands in the edge reconstruction (`src/Run.ts:222-228`), remove the copy there and confirm red — the test defends the seam the fix owns, per `docs/solutions/logic-errors/timeout-kills-credited-to-nobody.md` (prove the test by deleting the guard, not by reading it).
- **Execution note:** if driving the full engine in-process proves impractically heavy (worker/sandbox spawning), narrow to the faithful public seam that still spans differ → edge reconstruction → report projection, and state the narrowed scope in the unit's completion note.
- **Patterns to follow:** cli-lane fixture layout and command-runner config; the `runMutationTest` call shape in `cli/src/Cli.ts:1099-1103`; in-process layer composition style from `platform-node/tests/checker-group-then-check.integration.test.ts`; gherkin-spec scenario style from `tests/verdict-envelope.integration.test.ts`.
- **Test scenarios:**
  - Reused `Killed` mutant emits `killedBy` and `coveredBy` equal to the file's, with `statusReason: "Remembered"` (R1, R3).
  - Reused `Timeout` mutant emits without `killedBy` (R2).
  - Removing the attribution copy in the differ's `rememberedEntryOf` reddens the first scenario (revert-proof).
- **Verification:** `pnpm --filter @systemfsoftware/stryker-js-platform-node test` exits 0; the revert-delete makes it exit non-zero with the attribution assertion failing, then restoring green.

### U2. Contribution gate accepts an attributed fully-remembered report

- **Goal:** prove R4: `judgeTestContribution` returns `failed: false` for a report whose every kill is attributed (a fully-remembered package shape), and keeps the zero-attribution refusal for a blind report.
- **Requirements:** R4.
- **Dependencies:** U1 (the remembered report shape it produces).
- **Files:** `packages/testing/mutation/plugins/stryker-test-contribution/tests/test-contribution.integration.test.ts`
- **Approach:**
  1. Add a scenario: build a report where an in-scope `.property.test.ts` file's `killedBy` entries credit kills (the remembered-run shape — `Killed` mutants with `killedBy` present, `statusReason: "Remembered"`), pass `everyKillerRecorded: true`.
  2. Assert `judgeTestContribution(...)` returns `failed: false` (the gate judges rather than refuses).
  3. Leave the existing zero-attribution scenarios untouched — they keep their `failed: true` refusal.
- **Patterns to follow:** the suite's existing `reportOf`/`mutantOf` builders and bail-mode scenarios (`tests/test-contribution.integration.test.ts`); the plugin's public export `judgeTestContribution`.
- **Test scenarios:**
  - A report whose `Killed` all carry `killedBy` judges `failed: false` with `everyKillerRecorded: true` (R4).
  - A report with no `killedBy` anywhere still returns the zero-attribution refusal (existing guard preserved).
- **Verification:** `pnpm --filter @systemfsoftware/stryker-test-contribution test` exits 0; the first scenario reddens if the attribution copy in U1's seam is reverted together with the gatekeeper.

---

## Verification Contract

| Gate                          | Command                                                                           | Proves                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Reuse-path gatekeeper (R1-R3) | `pnpm --filter @systemfsoftware/stryker-js-platform-node test`                    | emitted report carries same `killedBy`/`coveredBy`, `statusReason: "Remembered"`, blind `Timeout` |
| Revert-redden (R1 gatekeeper) | remove the attribution copy in `rememberedEntryOf`, re-run the platform-node lane | the scenario defends the contract; restore green                                                  |
| Contribution gate (R4)        | `pnpm --filter @systemfsoftware/stryker-test-contribution test`                   | attributed fully-remembered report judges; blind report still refuses                             |
| Repo gate                     | `pnpm check:local`                                                                | REPO-D1                                                                                           |
| Release intents               | changeset gate (CI `scripts/guards/check-changeset.ts`)                           | REPO-R2 — test-only diff demands none; a surfaced src fix files what the gate flags               |

The CI half of the issue (contribution verdict on a real merged report) is confirmed by watching the PR's checks — the babysit tail, not a local command.

---

## Definition of Done

- R1–R4 all demonstrated: gatekeeper passes on HEAD, reddens on revert, restores green; contribution-gate scenarios land; `pnpm check:local` exits 0 after the last edit.
- No `.changeset` debt: none required for test-only, or intents filed for any surfaced src fix.
- Delivered as a PR watched to green (REPO-D2); tree left restartable; no leftover temporary fixtures or seeded files in the working tree.
