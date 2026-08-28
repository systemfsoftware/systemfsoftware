---
title: The contribution gate must only emit verdicts its mutation report supports
date: 2026-08-28
category: logic-errors
module: stryker-test-contribution
problem_type: logic_error
component: testing_framework
severity: high
symptoms:
  - "the gate credits a phantom (unmapped) killer id to a real file that then earns credit"
  - "the gate accuses a zero-kill test file the report gave no killable, covered mutant to defend"
  - "the gate claims every file kills a mutant nothing else kills even when a file only survived by covering an unattributed kill"
  - "the deletion verdict claims the same set is jointly deletable when deleting it together would resurrect a mutant"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - tooling
tags:
  - mutation-testing
  - stryker
  - test-contribution
  - attribution
  - silent-pass-gate
---

# The contribution gate must only emit verdicts its mutation report supports

## Problem

The `@systemfsoftware/stryker-test-contribution` gate decides whether a whole mutation run passes based on per-file kill attribution. It was emitting verdicts the report could not back, in four ways. Each is a fidelity failure of a **silent-pass verification mechanism**: the gate is the surface that can go green while the true answer is red, so the exact "can this false-pass or mis-state?" lens owns it.

1. **Phantom credit.** A mutant whose `killedBy` id maps to no test file (`fileById.get(id) === undefined`) was credited to that raw id as though it were a real file, and its real coverers were never exempted as covering an unattributed kill.
2. **No killable mutant still accused.** A zero-kill in-scope file was accused "toothless" even when the report offered it no non-`Ignored` mutant it could cover. The accusation is counterfactual — deleting a file the run never tested against a live mutant can never be shown to change nothing.
3. **Pass claims universal unique kills while a file only survived by exemption.** On a pass with no accused file, the gate printed "every file might kill none other," even when an in-scope file only survived because it covered an unattributed kill or had nothing to defend.
4. **Deletion verdict asserted per-file when only a joint claim could hold.** "Deleting these N test file(s) would leave every mutant just as dead" implies deleting the set together is safe — but it printed even when two files kill exactly the same mutants, so deleting both would delete every one of those mutants.

## Solution

### 1. Real-file attribution: `realFiles` vs `killersOf`

Two helpers with distinct semantics:

- `killersOf` — places every id, falling back to the raw id, so `[real, ghost]` still yields `size === 2` and denies a single real file sole credit (preserves the pre-existing `Should_DenySoleCredit` behavior).
- `realFiles` — returns only ids mapping to a real test file; inert unmapped ids are dropped. Used for **credit and exemption**: an all-unmapped `killedBy` never credits or spares a real file, and the real coverers of such a mutant get `coversUnattributedKill`.

The phantom mishandling was a gap: `killersOf` places every unmapped id, so an all-ghost `killedBy` never produced `size === 0` and never reached the unattributed branch. `realKillers.size === 0` fixes detection.

### 2. `killableCovered` — a file needs a live mutant to defend

`TestFileContribution` gains `killableCovered`, the count of non-`Ignored` mutants the file's tests cover. `toothlessTestFiles` adds `&& killableCovered > 0`. A file with zero is **unjudged** (unauditable), never accused: the deletion accusation requires a live mutant to have been handed to it.

### 3. Honest pass counts instead of the blanket claim

`judgeTestContribution`'s pass now returns the blanket "every file kills a mutant nothing else kills" **only when every in-scope file defends** (`soleKills > 0`). Otherwise it reports honest counts: `N judged; M exempted (cover a kill attributed to no test file); K unjudged (offered no killable, covered mutant)`. The blanket sentence is a countable claim one exempted or unjudged file falsifies.

### 4. Joint subsumption gates the deletion verdict

Deleting the accused set together leaves every mutant dead only if every mutant an accused file kills retains a killer outside the set. `jointSubsumption` reads `killedBy` only (real files), skips unattributed kills (they cannot testify), and returns false when an accused file's kill has no outside killer. On false the judge breaks the claim: "would not leave every mutant just as dead: some mutant only they kill would be resurrected." On true it keeps the deletion sentence. Both verdicts still `failed: true` — the distinction is the claim's truthfulness, not the pass/fail.

## Verification — every headline proven red when its guard is reverted

Each new behavior is pinned by a Gherkin scenario in `tests/test-contribution.integration.test.ts`, proven **red** when its guard is reverted to the old behavior, then re-verified green:

| Guard                            | Revert to            | Scenario goes red                                           |
| -------------------------------- | -------------------- | ----------------------------------------------------------- |
| `killableCovered > 0`            | remove the clause    | `Should_TreatZeroKillFileAsUnjudged…` accuses the bare file |
| `realKillers.size === 0`         | `killers.size === 0` | `Should_NotCreditPhantomKill…` loses the exemption          |
| honest pass-counts branch        | always blanket pass  | `Should_PassWithHonestCounts…` shows the blanket sentence   |
| `!jointSubsumption` fail verdict | force `true`         | `Should_FailWithoutClaimingJustAsDead…`                     |
| `jointSubsumption` true verdict  | force `false`        | `Should_ClaimJustAsDead…`                                   |

**Critical rebuild gotcha — vitest resolves `dist`, not `src`.** This package's tests import the public `default` export, which resolves to `dist/index.mjs` (the tsdown build), never `src/`. Every source edit must be followed by `pnpm exec tsdown` before `pnpm test`; a source-only revert leaves the suite green and the red measurement reads falsely green. This cost a full red-proof round before it was diagnosed.

## Prevention

- **Never let a gate print a sentence its report cannot evidence.** Every verdict clause is countable — "every killing test was recorded," "every mutant just as dead," "kills a mutant nothing else kills" — and each deserves a red-when-reverted proof.
- **Dump the report before theorizing.** When a mutation gate misbehaves, print `status / killedBy / coveredBy` per mutant before reasoning about the mechanism.
- **Red-when-reverted must be measured against what the tests actually execute** (`dist`), not the source, or the proof is vacuous.
- **`killableCovered` counts non-`Ignored`, not "killable" in the score sense.** A file covering only a `CompileError`/`RuntimeError` mutant is considered "offered a killable" by the literal definition though its mutant died from a non-test cause — intended per the issue, but a boundary worth a comment when read beyond the accusation.

## Still Open

- **`everyKillerRecorded` is caller-supplied, never recomputed.** The bail guard reads a config flag without cross-checking the report (e.g. a multi-coverer mutant whose `killedBy.length === 1` is the bail fingerprint). A misconfigured run could get the bail-guard pass on evidence that did not record every killer. Pre-existing gap, deliberately out of scope.
- **Duplicate test ids across files** are not rejected: `testFileById` last-write-wins gives non-deterministic attribution on a malformed report. Not produced by real runners; a uniqueness guard is future work.
- **A kill from a non-in-scope file** blames the in-scope coverer truthfully but outside its governance. Intentional semantics; kept.

## Related

- [Timeout kills are credited to no file, so the contribution gate accuses innocent property tests](../logic-errors/timeout-kills-credited-to-nobody.md) — the prior slice: exempt coverers of unattributed kills; this fix extends the same principle to unmapped ids and the rest of the verdict.
- `docs/residual-review-findings/test-contribution-gate.md` — the verified-verdict tracking surface.

## Commits

- `fix(stryker-test-contribution): emit only verdicts the report supports` (#284) — source, api.md, evaluator fixture, the 30 retained scenarios adapted for `killableCovered`, the 5 new behavior-scenarios.
- `test(stryker-test-contribution): pin unjudged and Ignored-cutoff paths` — two prose-fixed additions: judge-level "Reviewed: N judged … K unjudged" pass counts; `Ignored` mutants not counted as killable.

## Related docs

- Plan: `docs/plans/2026-08-28-004-fix-test-contribution-truthful-verdicts-plan.md` (KTDs: realFiles/killersOf distinction, killableCovered literal, joint subsumption in the judge, honest pass counts).
