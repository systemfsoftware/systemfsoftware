---
title: Reconcile the changeset none rule in the release-note convention and REPO-R2 - Plan
type: docs
date: 2026-10-13
topic: changeset-none-rule
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan
execution: code
supersedes: docs/plans/2026-10-12-2142-docs-changeset-none-rule-plan.md
---

# Reconcile the changeset none rule in the release-note convention and REPO-R2 - Plan

Supersedes the 2026-10-12 plan after review: R1-R3 now carry the tagged-package scope, the at-least-`patch` floor and a tell that refutes only `minor` or `major`, and AE1 greps the shipped wording.

## Goal Capsule

- **Objective:** An agent choosing a changeset bump reads one `none` rule wherever it looks: `none` only while the packed tarball stays byte-identical, at least `patch` once it changes.
- **Means:** correct the two sentences in `docs/solutions/conventions/a-release-note-claims-the-published-surface.md` and the `none` gloss in `AGENTS.md` REPO-R2 to the rule `.changeset/README.md:21-31` already states.
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
- R4. No other file changes: no changeset (no publishable package's build input moves), no release-tool or workflow change, and the document's other claims stay as written.

### Acceptance Examples

- AE1. **Covers R1-R3.** On the branch, `git grep -n -F -e 'internal-only change' -e 'identical surface earns' -e 'refuted its own bump' -e 'beside a sentence asserting' -- AGENTS.md docs/solutions/conventions/a-release-note-claims-the-published-surface.md` returns only line 51 (which reads "earns at least `patch`" and "admits `patch` at most") and line 79 (which reads "above `patch`").
- AE2. **Covers R4.** `git diff --name-only 763fd66399` lists only the two corrected files and this plan.

### Scope Boundaries

- Historical plans under `docs/plans/` that quote the old wording stay as written: they record past decisions, and the repo treats them as history.
- `.omp/rules-corpus/solution-problem-type-enum.json` embeds an old copy of the convention doc as a labelled classifier fixture for `problem_type`. It is history the corpus owns, and this change does not edit it.
- **Turbo:** this change edits two Markdown files outside every package's `build` inputs. It does not touch build speed, cache misses, CI task scope, affected work or the task graph.

### Key Decisions

- **Separate PR, not riding with the storybook screenshot follow-up.** The two share no file and no reviewer question. This one changes repo law in `AGENTS.md`; the other ships a `major` preset release with lint tests. Combining them would put a release-rule reading and a lint review in one verdict, and either finding would hold back the other. Rejected alternative: one combined PR, which saves a CI run but loses independent acceptance. Governs R4.
- **Point to the README, not restate it.** The README owns the rule and its tool citation. The convention doc and REPO-R2 state the boundary in one clause and cite it, so a future change to the rule edits one place. Governs R1, R3.

## Planning Contract

- KTD1. **The edits.** Line 51's two `none` claims become `patch` with the tarball condition; line 79's smell gains the `none`-on-a-changed-tarball case; REPO-R2's parenthesis becomes the tarball definition. Governs R1-R3.
- KTD2. **Formatting.** `./bin/dprint fmt` realigns the `AGENTS.md` table; the diff stays one row. Governs R3.

## Implementation Units

### U1. Correct the three statements

**Goal:** R1-R4. **Files:** `docs/solutions/conventions/a-release-note-claims-the-published-surface.md`, `AGENTS.md`. **Verification:** AE1, AE2, `./bin/dprint check`.

## Verification Contract

- AE1 and AE2 commands as written.
- `./bin/dprint check` exits 0; `changeset-management check 763fd66399` exits 0 with no new intent.
- Full-path ce-code-review, report-only, with every loaded pack rule marked COMPLY or VIOLATE with file:line, and a cross-model pass on DeepSeek or MiniMax; a timed-out reviewer is rerun.
- The privacy grep over files, names, commit messages and the PR body finds nothing before every push.

## Definition of Done

R1-R4 hold, AE1 and AE2 read true, CI is green on the pushed head, and the PR body carries the review receipt and the named cross-model model.
