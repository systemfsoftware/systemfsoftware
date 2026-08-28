---
title: fix: test-contribution evaluator emits only verdicts its report supports
created: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
topic: stryker-test-contribution-verdict-truthfulness
issue: https://github.com/systemfsoftware/systemfsoftware/issues/284
---

# fix: the test-contribution evaluator emits only verdicts its report supports

## Goal Capsule

- **Objective.** Every verdict `judgeTestContribution` prints is a true statement about the report it judged: kill credit lands only on real test files, exemption and unjudgedness are counted honestly in pass messages, a multi-file deletion claim holds jointly over the accused set, and a zero-kill in-scope file is called toothless only when the report offered it a killable, covered mutant.
- **Authority hierarchy.** Issue #284 acceptance criteria govern; repo invariants (REPO-S3 `repos/` read-only, REPO-D3 no mutation runs, REPO-R2 changeset gate, REPO-D1 `pnpm check:local`, root `AGENTS.md` never delete the tests the gate names) govern the tail. This plan governs `packages/testing/mutation/plugins/stryker-test-contribution/src/test-contribution.ts` plus its two integration test files and a changeset.
- **Stop conditions.** If the report schema cannot express the four-way per-file classification (judged / exempted / unauditable / toothless) from `testFiles`, `killedBy`, and `coveredBy` alone — e.g. `coveredBy` is absent for every mutant, making every non-killing file unauditable — stop and report before widening scope; do not invent report fields the Stryker schema does not define.
- **Execution profile.** Pure-decision logic change with proof-by-red: every new scenario pins one of the five listed behaviors and is proven red when its guard is reverted (the `docs/solutions/logic-errors/timeout-kills-credited-to-nobody.md` gatekeeper convention).
- **Tail ownership.** Caller (LFG) owns simplify → review → commit → PR → CI watch.

---

## Product Contract

### Summary

`@systemfsoftware/stryker-test-contribution/src/test-contribution.ts` builds a per-file kill accounting from a Stryker mutation report and emits one verdict: fail when an in-scope `.workflow|.policy|.kernel.property.test.ts` file kills no mutant that another file does not also kill, naming the accused files with a deletion counterfactual. Five current outcomes do not follow from the report the code reads:

1. A killing mutant whose `killedBy` names only an unmapped test id is credited to a phantom key that `byTestFile` (built over real `testFiles`) later drops; the owning file is never exempted and can be flagged toothless on a kill that placed nobody.
2. When a file passed only because it covers an unattributed kill (the `coversUnattributedKill` exemption), the pass message still asserts "Every test file … kills a mutant nothing else kills."
3. One exempting kill exempts the whole file from the toothless predicate even when every killable covered mutant the report offered the file is provided; the pass message then certifies something the exemption itself falsifies.
4. Two files that kill exactly the same mutants are each flagged with "Deleting these 2 test file(s) would leave every mutant just as dead" — deleting both resurrects every one of the mutants they share.
5. A zero-kill in-scope file can be told it is toothless when the report offered it no non-`Ignored`, covered mutant — the file had nothing it could kill.

### Problem Frame

The evaluator's claim is counterfactual ("deleting this file changes no mutant's fate"). A destructive verdict is sound only when it is a true statement about the report. Three independent gaps produce the unsound verdicts:

- **Phantom attribution.** `killersOf` falls back to the raw unmapped test id, so a mutant with `killedBy: ["unmapped"]` yields a one-element killer set whose key no real file owns; `byTestFile` only iterates `Object.keys(testFiles)`, dropping it, so the sole-kill never lands and the coverer is never exempted. The timeout-kill fix (empty `killedBy`) established the correct branch for "a kill we cannot place"; a wholly-unmapped `killedBy` takes the same branch that branch never fires today because the phantom returns a size-1 set.
- **Undifferentiated pass.** The success message "every in-scope file kills uniquely" is emitted whenever `toothless.length === 0`, with no accounting for files spared by the exemption rule or files the report gave nothing to kill. Those files are not counted, so the sentence overstates.
- **Set claim from per-file predicates.** `toothlessTestFiles` returns the list of individually-redundant files; `judgeTestContribution` asserts the set-level claim without checking it. The joint counterfactual (delete all N) holds only under joint subsumption — every mutant killed by an accused file retains a killer outside the accused set. The Stryker report schema (`mutation-testing-report-schema.json`) defines `killedBy`/`coveredBy` as test-id arrays keyed by the `testFiles[].tests[].id` record, so the joint check is computable from the same data.

### Requirements

- R1. Kill credit lands only on real test files. A mutant whose `killedBy` maps to no real file is an unattributed kill: its coverers receive the unattributed-kill exemption, no real file is flagged toothless on its account, and no key that is not a real file is credited. (issue AC2)
- R2. The pass verdict states the judged / exempted / unauditable counts whenever any in-scope file is exempted or unauditable; it never asserts that every in-scope file kills a mutant nothing else kills while any file is exempt or unauditable. (issue AC3)
- R3. A multi-file deletion claim is emitted only when every mutant killed by any accused file retains at least one killer outside the accused set (joint subsumption); sets that satisfy joint subsumption still receive the deletion verdict. (issue AC4)
- R4. An in-scope file that killed nothing while the report offered it no non-`Ignored`, covered mutant is reported unjudged (unauditable), not toothless; a zero-kill file offered a killable, covered mutant is still toothless. (issue AC5)
- R5. Exclusion from, never weakening of, the attribution guard: a run that credits no kill to any test file stays an unmeasurable run; the bail-mode configuration-error, and the `coversUnattributedKill` exemption itself (unmeasurable vs toothless) survive intact.
- R6. `pnpm check:local` exits 0 after the last edit; a `.changeset/` intent files for `@systemfsoftware/stryker-test-contribution` describing the consumer-observable verdict changes (REPO-R2, REPO-R3).

### Scope Boundaries

- **Out of scope (with reason):** `repos/` (REPO-S3 read-only); any real mutation run (REPO-D3); `tsdown.config.ts`/`package.json#exports` (no export map change needed — the API surface stays unchanged; REPO-S4 irrelevant); the plugin evaluator shell (`test-contribution-evaluator.ts`) — its `VerdictFail`/`null` routing is already behavior-complete and untouched by message changes.
- **Out of scope:** rewording messages while the predicates underneath stay unchanged; deleting the exemption machinery instead of scoping it (regresses the unmeasurable-vs-toothless distinction); resolving false claims by refusing to judge everything; early-returning pass for degenerate reports.

### Assumptions

- `coveredBy` and `testFiles` are present in the reports the gate judges, matching the schema (`coveredBy` "can simply be left out" only when the framework does not measure it); where absent, `coveredBy` is treated as empty and the file is unauditable, never toothless.
- A "killable, covered mutant" is a mutant the file covers (`coveredBy` maps to it) with `status !== 'Ignored'`; this is the issue's literal "non-`Ignored`, covered" definition.
- `Timeout` is a killing status whose `killedBy` is empty (`[]`) — the existing exemption basis — and it stays that way (the timeout solution doc).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Place every killer id, then admit only real files.** Keep `killersOf`'s fallback-to-id bucketing for the _size_ test (a phantom co-killer must still deny sole credit to the real file), but credit, exempt, and count only ids that map to a real test file. A mutant whose placed real-file killer set is empty is an unattributed kill — its coverers (real files) are exempt, no real file is flagged on its account. (over: treating an unmapped id as an empty `killedBy` is equivalent at the top level; but bucketing stays so a `[real, ghost]` pair keeps the existing no-sole-credit behavior.)
- KTD2. **Add `killableCovered` to `TestFileContribution`.** Per in-scope file, count non-Ignored covered mutants; this singles out the unauditable file from the toothless file (R4). The field rides the existing exported interface, so it is a consumer-observable API addition — file a `minor` changeset (pre-1.0, REPO-R1 allows the break).
- KTD3. **Deletion message gated on joint subsumption.** `judgeTestContribution` recomputes the per-mutant real-killer set from the report and emits the "deleting these N files … " claim only when R3's joint subsumption holds; a set that fails joint subsumption gets a truthful per-file redundancy statement that names the files without asserting the joint delete is safe, and still fails the run.
- KTD4. **Pass message states the three-way split honestly.** When the accused set is empty but not every in-scope file defended, the message reports judged / exempted / unauditable counts (R2); it asserts "every in-scope file kills a unique mutant" only when every in-scope file is judged-and-defends.

### Sequencing

All changes are in one module plus its tests; units U1 (bookkeeping + predicate) and U2 (verdicts) share the same files and are edited together in the implementation session, with tests authored alongside each behavior. U3 (changeset + gate) last.

---

## Implementation Units

### U1. Real-file attribution and the unauditable/toothless split

- **Goal:** `contributionByTestFile` credits only real files, exempts coverers of unattributed kills (including all-unmapped `killedBy`), and reports `killableCovered` per file.
- **Dependencies:** none.
- **Files:** `packages/testing/mutation/plugins/stryker-test-contribution/src/test-contribution.ts`; `tests/test-contribution.integration.test.ts` (new + adjusted fixtures; the existing idle-file scenarios at lines 184, 228, 272, 337, 359, 430, 564, 608, 627, 678 omit `coveredBy` and must gain a covered, non-`Ignored` mutant so their idle file keeps `killableCovered > 0` and stays accused; `Should_StillAccuseAFileThatCoversNothing_When_ASiblingCoversTheUnattributedKill` at line 272 flips polarity — the file covering nothing is now unauditable, not accused).
- **Approach:**
  1. In `contributionByTestFile`, compute `realFileNames(ids)` that keeps only `fileById.get(id) !== undefined`.
  2. Per mutant: `killers = killerSet(killedBy)` (bucket size), `realKillers = realFileNames(killedBy)`. If `realKillers.size === 0` → exempt coverers via `realFileNames(coveredBy)`, `continue` (unattributed). Otherwise credit `totalKills`/`soleKills` over `realKillers` only, with `soleKill = killers.size === 1` (a phantom co-killer still denies sole credit).
  3. Count `killableCovered` per file: for every mutant with `status !== 'Ignored'` whose `coveredBy` maps to the file via `realFileNames(coveredBy)`, increment. Expose on `TestFileContribution` (KTD2).
- **Patterns to follow:** the existing `coversUnattributedKill` exemption shape and the comment style already in this file; the fixture style (`mutantOf`, `reportOf`, `EXACT`/`BAILED`) in `tests/test-contribution.integration.test.ts`.
- **Test expectation:** scenarios pinning R1 (phantom-only killer → coverers exempt, no real file accused, no credit on a non-file key), R4-a (no killable covered → unauditable, white-space untouched) — each red when its guard is reverted.
- **Verification:** `pnpm --filter @systemfsoftware/stryker-test-contribution test`.

### U2 — Honest verdicts: split counts and joint deletion

- **Goal:** `judgeTestContribution` emits only sentences its report supports; the per-file predicate stays `toothlessTestFiles` and gains the unauditable clause, while joint subsumption lives in one internal helper (KTD3) — `toothlessTestFiles` never owns the set-level claim.
- **Requirements:** R2, R3, R4, R5.
- **Files:** `src/test-contribution.ts`; `tests/test-contribution.integration.test.ts`.
- **Approach (signature-compatible where the two files already exist):**
  1. In `toothlessTestFiles`, add the `killableCovered > 0` clause (a file with none is not accused) — R4.
  2. Add one internal (unexported, per REPO-A3) helper that recomputes each mutant's real-killer set from the report's `killedBy` and decides R3's joint subsumption on an accused set; `judgeTestContribution` alone calls it. This is KTD3's recompute — no alternative (accumulator extension or a public predicate) is left open.
  3. In `judgeTestContribution`, after the existing bails (no in-scope file / bail config / zero-credited-kill guard — these stay), when `toothless.length === 0`:
     - if every in-scope file is judged+defends → existing unique-kill pass message (unchanged claim, now only reachable when the claim holds);
     - else → pass with counts: judged N, exempt M (cover an unattributed kill), unauditable K (no killable covered mutant); never the unique-kill sentence — R2.
  4. When `toothless.length > 0`: if joint subsumption holds over the accused set → the deletion message (R3 allows it); else → a truthful per-file statement naming the files without the joint delete claim, still `failed: true`; list stays bulleted/sorted as today.
- **Test expectation:** scenarios for (2) pass-with-exempt/unauditable counts; (4) joint deletion both when scrambled and when honestly stated; each of the five behaviors pinned and proven red when its guard is reverted.
- **Verification:** `pnpm --filter @systemfsoftware/stryker-test-contribution test`; red-when-reverted measurement for each new scenario.

### U3 — Gate, changeset, README

- **Requirements:** R6.
- **Files:** `.changeset/*` (new intent), `README.md` (if it describes the old verdict wording — check and update only if inaccurate).
- **Approach:** run `pnpm change --bump minor --summary "<consumer-observable verdict-change summary>"` against the published package per REPO-R2/R3 (a `minor` because consumers observe the new predicates and message shapes; a `none` must not be used since behavior is observable). Verify the changeset body names only what an adopter sees: the gate now reports exempt/un-judged files honestly and only deletes files whose removal is jointly safe. Run `pnpm check:local`.
- **Verification:** draws the local check chain green; changeset gate (`scripts/guards/check-changeset.ts`) passes.

---

## Verification Contract

| Gate                   | Command                                                                | Proves                                                       |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| U1/U2 unit+integration | `pnpm --filter @systemfsoftware/stryker-test-contribution test`        | acceptance criteria of the five behaviors                    |
| Red-when-reverted      | revert each new scenario's guard, re-run the package test, observe red | each scenario genuinely pins its behavior (issue gatekeeper) |
| Repo gate              | `pnpm check:local` (post-last-edit)                                    | REPO-D1                                                      |
| Changeset              | `scripts/guards/check-changeset.ts` via CI (hash-verdict)              | REPO-R2                                                      |
| Contract/kill evidence | PR checks watched green                                                | REPO-D2                                                      |

## Definition of Done

- R1–R6 demonstrated: the package test suite green, each new scenario red when its guard is reverted, `pnpm check:local` exits 0 after the last edit, a `minor` changeset filed for the published package.
- No `repos/` edit, no mutation run started (REPO-D3), no test the gate names deleted (repo `AGENTS.md`).
- Tree left restartable (no stray fixtures or dead code) and shipped as a PR watched to green (REPO-D2).
