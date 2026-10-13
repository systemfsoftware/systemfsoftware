---
title: Reconcile the changeset none rule in the release-note convention and REPO-R2 - Plan
type: docs
date: 2026-10-13
topic: changeset-none-rule
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan
execution: code
supersedes: docs/plans/2026-10-13-0742-docs-changeset-none-rule-plan.md
---

# Reconcile the changeset none rule in the release-note convention and REPO-R2 - Plan

Supersedes the 2026-10-13 07:42 plan after the full-path review at `8ec030adcf`: R7 states the lightweight-tag precondition and both `release plan` refusals, R8 adds the tarball floor to the convention doc's recipe and checklist, R9 corrects the catalog-flip bullet, and AE1 follows the code smell to line 81.

## Goal Capsule

- **Objective:** An agent choosing a changeset bump reads one `none` rule wherever it looks: `none` only while the packed tarball stays byte-identical, at least `patch` once it changes.
- **Means:** correct the two sentences in `docs/solutions/conventions/a-release-note-claims-the-published-surface.md` and the `none` gloss in `AGENTS.md` REPO-R2 to the rule `.changeset/README.md` already states, make that doc's asymmetry paragraph name every gate accurately, and state in `.changeset/README.md` the tarball-only case no PR check sees.
- **Product authority:** the root's post-merge follow-up B of 2026-10-12, routed from #746's review finding #1.
- **Open blockers:** none.

## Product Contract

### Summary

Three sentences still teach the pre-#746 `none` rule. This change rewrites them to the corrected rule and touches nothing else.

### Problem Frame

`.changeset/README.md:21-31` (on `main` since #746) says `none` is correct only while the packed tarball stays byte-identical, and that a changed tarball earns at least `patch`. Three statements on `main` at `763fd66399` contradict it:

- `a-release-note-claims-the-published-surface.md:51`: "A whole-module restructure behind an identical surface earns `none`", and a body that needs "purely internal" "has admitted its own bump is `none`".
- `:79`, a code smell: "A bump above `none` beside a sentence asserting the surface is unchanged." It flags the `patch` the README requires.
- `AGENTS.md:71` REPO-R2: "(`none` = internal-only change)".

The release tooling enforces the README's rule. In `pnpm-release-management` at `8cd6e83009531de040cd9c03e1370b4966fd2a12`, `release plan` integrity-checks every tagged candidate the plan does not release (`packages/github-release-engine/src/plan.ts:121-134`). A package whose intent is only `none` is not released, so it is checked: its recorded tag digest is compared with the current tarball, and any differing file fails with `TagIntegrityMismatch` (`src/integrity.ts:134-161`, called at `plan.ts:201-205`). An internal-only change that alters the tarball and follows the old wording therefore blocks the release.

### Requirements

- R1. `a-release-note-claims-the-published-surface.md:51` states that, for a package tagged at its current version, an internal restructure earns at least `patch` once its packed tarball changes, citing `.changeset/README.md`; its tell refutes only a `minor` or `major` whose body needs the surface and runtime behaviour unchanged.
- R2. `:79` flags a bump above `patch` beside a sentence asserting the surface and runtime behaviour are unchanged, and `none` on a tagged package whose tarball changed.
- R3. `AGENTS.md` REPO-R2 glosses `none`, for a package tagged at its current version, as "packed tarball byte-identical" and points to `.changeset/README.md`. Its Gate column is unchanged.
- R4. No other file changes: no changeset (no publishable package's build input moves), no release-tool or workflow change, and the convention doc's other claims stay as written.
- R5. The convention doc's asymmetry paragraph names the false `minor` beside the false `major`, and attributes the catch of a false `none` to the packed-manifest check and the release tooling's tag digest check, stating that the hash-keyed changeset gate accepts a `none` row.
- R6. `.changeset/README.md` states that a README- or LICENSE-only edit changes the packed tarball without moving the hash, so a package tagged at its current version needs a `patch` intent no PR check demands; review catches it, and `release plan` otherwise refuses it with `TagIntegrityMismatch`.
- R7. `.changeset/README.md` states that a lightweight tag records no digests, so `none` is never correct for a package whose current version carries one: `release plan` refuses it with `TagAnnotationLightweight` whatever its tarball (`pnpm-release-management` 8cd6e830, `packages/github-release-engine/src/plan.ts:186-188`), and the README- or LICENSE-only case names both refusals.
- R8. The convention doc's RIGHT recipe compares the packed tarball with the tag's digests before the bump, and Verification & Prevention gains a **Tarball floor** check; its asymmetry paragraph names the Changeset Check `packed-manifest` job.
- R9. `.changeset/README.md`'s catalog-flip bullet names the `packed-manifest` job that demands a releasing intent (`scripts/tools/repo-checks/packed-manifest.ts:1-7,164-176`), replacing "reviewed in the release pass instead".

### Acceptance Examples

- AE1. **Covers R1-R3.** On the branch, `git grep -n -F -e 'internal-only change' -e 'identical surface earns' -e 'refuted its own bump' -e 'beside a sentence asserting' -- AGENTS.md docs/solutions/conventions/a-release-note-claims-the-published-surface.md` returns only line 51 (which reads "earns at least `patch`" and "admits `patch` at most") and line 81 (which reads "above `patch`").
- AE2. **Covers R4-R6.** `git diff --name-only 763fd66399` lists only `.changeset/README.md`, `AGENTS.md`, the convention doc and this plan.
- AE3. **Covers R5.** The asymmetry paragraph contains "a false `minor`" and "the hash-keyed changeset gate accepts a `none` row".
- AE4. **Covers R6.** `.changeset/README.md` contains "A README- or LICENSE-only edit still changes the packed tarball".
- AE5. **Covers R7.** `.changeset/README.md` contains "`none` is never correct for a package" and "`TagAnnotationLightweight`".
- AE6. **Covers R8, R9.** The convention doc contains "**Tarball floor.**" and "packed tarball vs the tag's digests"; `.changeset/README.md` contains "the Changeset Check `packed-manifest` job demands".

### Scope Boundaries

- Historical plans under `docs/plans/` that quote the old wording stay as written: they record past decisions, and the repo treats them as history.
- `.omp/rules-corpus/solution-problem-type-enum.json` embeds an old copy of the convention doc as a labelled classifier fixture for `problem_type`. It is history the corpus owns, and this change does not edit it.
- **Turbo:** this change edits two Markdown files outside every package's `build` inputs. It does not touch build speed, cache misses, CI task scope, affected work or the task graph.

### Key Decisions

- **Separate PR, not riding with the storybook screenshot follow-up.** The two share no file and no reviewer question. This one changes repo law in `AGENTS.md`; the other ships a `major` preset release with lint tests. Combining them would put a release-rule reading and a lint review in one verdict, and either finding would hold back the other. Rejected alternative: one combined PR, which saves a CI run but loses independent acceptance. Governs R4.
- **Full-path review rulings at `8ec030adcf` (run `20261013-075455-814da566`).** Fixed: the catalog-flip bullet claimed no PR gate (correctness P3, pre-existing, R9); the README case promised `TagIntegrityMismatch` where a lightweight tag fails differently (agent-native P2, R7) - its suggested "caught by review alone" was rejected, because `plan.ts:186-188` refuses a lightweight-tagged candidate with `TagAnnotationLightweight`; the `none` rule omitted the lightweight precondition (adversarial P2, R7, in the README rather than REPO-R2, whose cell stays frozen); the recipe and checklist carried no tarball step (adversarial P3, R8). Rejected with reason: a fixture building two tarballs that differ only by README (adversarial testing gap) - the refusal belongs to `pnpm-release-management`, whose own tests own it; this PR changes prose only.
- **Residual rulings (2026-10-13).** Fixed: the asymmetry paragraph's missing false `minor` and its gate attribution (R5), and the hash-versus-tarball divergence (R6, stated in `.changeset/README.md` rather than in REPO-R2, because a longer REPO-R2 cell re-flows the whole `AGENTS.md` table and would conflict with the open PRs that edit it). Rejected: a mechanical check that the rule's restatements stay in step, because `ci-wall-clock/no-lane-grades-the-repos-own-docs` refuses a lane over the repo's own docs and GATE1 requires operator sign-off for a new gate. Named follow-up, owner root: `skill://author-changesets` still teaches the pre-#746 `none` rule; it lives in the shared agent harness, outside every repository this PR can change. Governs R5, R6.
- **Point to the README, not restate it.** The README owns the rule and its tool citation. The convention doc and REPO-R2 state the boundary in one clause and cite it, so a future change to the rule edits one place. Governs R1, R3.

## Planning Contract

- KTD1. **The edits.** Line 51's two `none` claims become `patch` with the tarball condition; line 79's smell gains the `none`-on-a-changed-tarball case; REPO-R2's parenthesis becomes the tarball definition. Governs R1-R3.
- KTD2. **Formatting.** `./bin/dprint fmt` realigns the `AGENTS.md` table; the diff stays one row. Governs R3.

## Implementation Units

### U1. Correct the three statements

**Goal:** R1-R4. **Files:** `docs/solutions/conventions/a-release-note-claims-the-published-surface.md`, `AGENTS.md`, `.changeset/README.md`. **Verification:** AE1-AE4, `./bin/dprint check`.

## Verification Contract

- AE1-AE4 as written.
- `./bin/dprint check` exits 0; `changeset-management check 763fd66399` exits 0 with no new intent.
- Full-path ce-code-review, report-only, with every loaded pack rule marked COMPLY or VIOLATE with file:line, and a cross-model pass on DeepSeek or MiniMax; a timed-out reviewer is rerun.
- The privacy grep over files, names, commit messages and the PR body finds nothing before every push.

## Definition of Done

R1-R9 hold, AE1-AE6 read true, CI is green on the pushed head, and the PR body carries the review receipt and the named cross-model model.
