---
title: Delete the upstream test grader package - Plan
type: chore
date: 2026-10-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Delete the upstream test grader package - Plan

## Goal Capsule

- **Objective:** the repository carries no machinery that grades in-tree tests against an upstream source, so every fork owns its tests outright and no gate, CI step, script, dependency or live doc refers to that machinery.
- **Means:** delete the grader package and every wiring point outright, in dependency order: unwire gates, then CI, then the package (KTD5).
- **Naming:** "the grader" is the private workspace package this branch is named after: directory `packages/<grader>/`, npm name `@systemfsoftware/<grader>`. This file never spells the name, because R2's tree-wide search must come back empty and this plan ships in the same PR (KTD6).
- **Authority:** the unit contract from the sub-conductor, then `AGENTS.md` (REPO-D1, REPO-R2, Surface Classes) and the global DEL1 rule, then this plan.
- **Stop conditions:** stop and report if any workspace member, CI workflow or flake output turns out to consume the grader's bin, exports or build output; if removing the `@noble/hashes` catalog entry breaks something real (then keep the entry and report why); if the changeset gate demands an intent; or if the R2 search matches a `docs/solutions/` entry the plan does not name.
- **Who finishes:** `ce-work` implements on a branch cut from `main` (not stacked; `origin/main` is merged up if it moves, never rebased or force-pushed) and pushes; the caller opens the PR and watches CI; the sub-conductor merges.

---

## Product Contract

### Summary

Delete `packages/<grader>/`, its four pending changesets, its root gate wiring, the static CI lane's fetch of family source refs, the unused `guard:upstream` turbo lane, and its sole catalog dependency, then regenerate the lockfile with pnpm.

### Problem Frame

The grader byte-matches verbatim upstream test files, port regions and retired cases, and grades in-place subtree runs from Vitest reports. The owner's standing rule is that forks are sovereign and own their tests: no manifests, pins, byte-match tests, staging or oracle lanes against upstream (`AGENTS.md` REPO-O1 already states the ownership half). On `main` no family manifest exists, so the grader grades nothing; its only live effect is building itself and running `--selftest` inside `gate:repo`.

### Key Decisions

- **Delete outright.** Chosen over making it private (it already is), moving or archiving it, or leaving a stub. (session-settled: user-directed — chosen over privatize/archive/stub: forks are sovereign and a retained grader invites re-use.) Governs R1, R2.
- **No replacement guard.** Nothing new checks that the machinery stays gone; the R2 search is a one-time acceptance check, not a gate. (session-settled: user-directed — chosen over a new lint or repo-check: GATE1 forbids unapproved gates.) Governs R2, R8.
- **No tombstone or deprecation release.** (session-settled: user-directed — chosen over a final `major` changeset: the package is private and was never released.) Governs R7.
- **Dated plans and CHANGELOG history stay untouched.** (session-settled: user-directed — chosen over rewriting history: plans before 2026-10-10 are records.) Governs R2.
- **The in-place-run hook goes with the grader.** The root `gate:upstream` script and the `guard:upstream` turbo task are the grader's in-place-run hook (its README documents a `guard:upstream` package script) and no package defines one. (session-settled: user-directed — chosen over keeping the lanes as inert scaffolding: they are part of the same machinery.) Governs R6.
- **The static lane keeps its commit-graph fetch.** Only the family-ref fetch step goes; the following commit-graph step stays because `repo-checks` needs `origin/main`, and is renamed so it no longer mentions the removed fetches. (session-settled: user-directed — chosen over deleting both steps: the second serves `repo-checks`, not the grader.) Governs R4.

### Requirements

**Package and release records**

- R1. `packages/<grader>/` does not exist.
- R7. `.changeset/clean-tools-sip.md`, `.changeset/in-place-run-report.md`, `.changeset/silly-hats-kiss.md` and `.changeset/silly-kids-compare.md` are deleted; each bumps only the grader, and `clean-tools-sip.md`'s body describes the earlier unit-of-work kit lockfile drop rather than the grader.

**Tree-wide absence**

- R2. A case-insensitive `git grep` for the pattern in the Verification Contract returns matches only in `docs/plans/*` files dated before 2026-10-10 and in CHANGELOG history.

**Gate and CI wiring**

- R3. Root `gate:repo` runs only the flake's `repo-checks`; it no longer builds the grader or runs its selftest.
- R4. `.github/actions/checks-lane/action.yml` has no step reading family-manifest source refs, and no step name refers to the removed fetches.
- R6. The root `gate:upstream` script, its calls in `check:ci` and `check:local`, and the `guard:upstream` task in `turbo.json` are gone (KTD1).

**Dependencies**

- R5. `pnpm-lock.yaml` no longer names the grader and is regenerated by pnpm, and the `@noble/hashes` catalog entry in `pnpm-workspace.yaml` is gone (KTD2).

**Delivery**

- R8. A PR into `main` is green on its head, `pnpm gate:repo` and `pnpm check:local` pass locally after the last edit, and the diff adds no skip, `.only`, lint-disable or baseline row.

### Scope Boundaries

- Considered and not built: a repo-check or lint rule asserting the grader stays deleted. GATE1 requires operator sign-off for new gates and the unit contract forbids a replacement guard; evidence that would change this is a re-introduction landing despite review.
- Not touched: the static lane's `fetch-depth: 2` in `.github/workflows/ci.yml`, and the commit-graph step's `git fetch --filter=tree:0 --unshallow` command; only that step's display name changes, dropping "after the depth-1 fetches" (KTD3, U2).
- Not touched: `.github/consumer-fixture/pnpm-lock.yaml`, which resolves `@noble/hashes` through its own jsdom closure, not through this workspace's catalog.
- Not touched: `docs/plans/2026-10-09-0341-ci-release-adoption-plan.md` and `docs/plans/2026-10-09-0715-refactor-distributable-repo-checks-plan.md`, which mention the grader as dated records.

### Sources

- `package.json:19-26` — `gate:upstream`, `gate:repo` (builds the grader, runs `dist/cli.mjs --selftest`), `check:ci`, `check:local`.
- `turbo.json:105-112` — `guard:upstream` task, `dependsOn: ["test"]`, uncached.
- `.github/actions/checks-lane/action.yml:51-65` — family-ref fetch step and the following commit-graph step.
- `pnpm-workspace.yaml:40` and `pnpm-lock.yaml` importer `packages/<grader>` — `@noble/hashes` catalog entry and its only workspace consumer.
- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md` — observed hash table: deleted package skipped, catalog and lockfile-only edits re-hash nothing.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Delete the `gate:upstream` script, both of its call sites, and the `guard:upstream` turbo task in one edit.** `turbo run guard:upstream --dry=json` on `2d5bd682a0` lists 50 `guard:upstream` tasks, all `<NONEXISTENT>`, and the lane's only work is 40 `test` tasks pulled in through `dependsOn`. `check:ci` already runs those through `gate:test`, and `check:local` through `gate:local`, so removal drops no coverage. (session-settled: user-directed — chosen over keeping the lanes as inert scaffolding: they are the grader's in-place-run hook.) Governs R6.
- KTD2. **Drop the `@noble/hashes` catalog entry by hand.** The entry exists only for the grader, so leaving it is a leftover reference. pnpm 12 does not prune unused catalog entries on a plain `pnpm install` (no `catalogPrune` is set here, and pnpm/pnpm#15273 reports the v12 install path skips the sweep), so the line is deleted in `pnpm-workspace.yaml` and `pnpm install` rewrites the lockfile's mirrored `catalogs` block; committing one without the other fails frozen installs with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` (https://pnpm.io/catalogs). The lockfile pnpm produces is accepted as is; the check is `pnpm install --frozen-lockfile` passing and the lockfile no longer naming the grader.
- KTD3. **Keep the static lane's commit-graph fetch and rename its step.** `fetch-depth: 2` and `git fetch --filter=tree:0 --unshallow` serve `repo-checks subtrees` and `single-plan` (`docs/plans/2026-10-09-0715-refactor-distributable-repo-checks-plan.md`, decision 6), not the family-ref fetch. The step's name drops "after the depth-1 fetches", which referred to the removed step. (session-settled: user-directed — chosen over deleting both steps: `repo-checks` needs `origin/main`.) Governs R4.
- KTD4. **No changeset for the deletion.** The grader is `private: true` at `0.0.0` with no tag locally or on `origin`. The changeset gate skips deleted packages, and the versioning rule binds published packages only (pack: package-topology, surface-changes-are-versioned.md).
- KTD5. **Three commits in dependency order.** Gate wiring first, because deleting the package while `gate:repo` still builds it breaks the gate. The Evaluator-class action edit gets its own commit per `AGENTS.md` Surface Classes. The package, changesets, catalog entry and lockfile go last, together.
- KTD6. **This plan does not spell the grader's name.** R2's search runs over the PR head, which includes this file. The Verification Contract writes the search with bracketed characters so the pattern text cannot match itself.

### Risks

- The changeset hash table was observed on turbo 2.10.5 and the repo now runs 2.11.5. If the lockfile rewrite re-hashes publishable `#build` tasks, the changeset gate demands intents the deletion did not earn. The gate run in the Verification Contract catches this before push; a non-empty verdict is a stop condition.

### Assumptions

- No external repository consumes the grader. It was never published (KTD4), and `docs/plans/2026-10-09-0341-ci-release-adoption-plan.md` records a 2026-10-09 search across both organisations that found no consumer.
- The branch is not stacked. `gate:repo` runs `single-plan --base origin/main` (REPO-D2) and this PR already adds one plan, so stacking under an open PR that adds its own plan would fail the gate. The branch is cut from `main`; if `origin/main` moves, it is merged up, never rebased.

---

## Implementation Units

### U1. Unwire the grader from root gates

- **Goal:** root scripts and turbo no longer build, run or schedule anything for the grader.
- **Requirements:** R3, R6.
- **Dependencies:** none.
- **Files:** `package.json`, `turbo.json`.
- **Approach:**
  1. `gate:repo`: keep the `nix run --no-write-lock-file .#repo-checks -- …` invocation as is and drop the grader build and selftest that follow it.
  2. Delete the `gate:upstream` script and its `|| s=1` clauses in `check:ci` and `check:local`, leaving each chain's `s=0 … exit $s` shape intact.
  3. Delete the `guard:upstream` task from `turbo.json` (KTD1).
- **Test expectation:** none -- gate wiring only; the proof is the gates themselves.
- **Verification:** `pnpm gate:repo` exits 0 and runs only `repo-checks`. The R6 absence row of the Verification Contract passes.

### U2. Drop the family-ref fetch from the static lane

- **Goal:** the static lane no longer reads family manifests or fetches their source refs.
- **Requirements:** R4.
- **Dependencies:** none; lands as its own commit (KTD5).
- **Files:** `.github/actions/checks-lane/action.yml`.
- **Approach:** delete the "Fetch the declared upstream family refs" step and rename the following commit-graph step to drop the reference to the removed fetches (KTD3). The stryker step's `jq` use is unchanged.
- **Test expectation:** none -- CI wiring; proof is the static lane on the PR.
- **Verification:** on the PR, the static lane's "Each repo check fails on a planted violation" step passes, which shows the commit graph is still fetched.

### U3. Delete the package, its changesets and its catalog dependency

- **Goal:** the grader, its pending release records and its sole dependency leave the tree, and pnpm regenerates the lockfile.
- **Requirements:** R1, R5, R7.
- **Dependencies:** U1, because `gate:repo` must stop building the grader first.
- **Files:** `packages/<grader>/` (whole directory: `src/`, `tests/`, `etc/`, manifests, configs), `.changeset/clean-tools-sip.md`, `.changeset/in-place-run-report.md`, `.changeset/silly-hats-kiss.md`, `.changeset/silly-kids-compare.md`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Approach:**
  1. Remove the package directory and the four changesets.
  2. Remove `"@noble/hashes": 2.4.0` from the default catalog (KTD2).
  3. Run `pnpm install` without `--frozen-lockfile` and keep its lockfile output unedited.
- **Test expectation:** none -- deletion; the grader's own tests leave with it and no consumer remains to test.
- **Verification:**
  - `pnpm install --frozen-lockfile` exits 0 on the result.
  - The lockfile's `catalogs` block has no `@noble/hashes` row.
  - The lockfile no longer names the grader.
  - `pnpm map` no longer lists the grader.

### U4. Prove absence and deliver

- **Goal:** acceptance holds on the PR head and CI is green.
- **Requirements:** R2, R8.
- **Dependencies:** U1, U2, U3.
- **Files:** none expected. No tracked file outside the two dated plans named in Scope Boundaries matches R2's pattern today; if the search surfaces a match the plan did not name, stop and report it rather than editing or deleting it under this unit.
- **Approach:** run the Verification Contract in order, merging `origin/main` up first if it moved, then push for the caller to open the PR and watch CI.
- **Test expectation:** none -- verification-only unit.
- **Verification:** every Verification Contract row passes, and every check on the PR head is green.

---

## Verification Contract

| Check               | Command or source                                                                                                                                                                                                      | Pass condition                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R2 absence          | `git grep -n -i -E 'upstream[-_ ]?manifest\|upstream[-]family\|upstream-tests[.]json\|tsconfig[.]upstream-test\|check[-]upstream-test'` (drop the backslashes before the pipes when running it; they escape the table) | matches only in `docs/plans/*` dated before 2026-10-10 and in CHANGELOG history          |
| R6 absence          | `git grep -n -e gate[:]upstream -e guard[:]upstream -- . ':!docs/plans/2026-10-10-1718-chore-delete-upstream-grader-plan.md'`                                                                                          | no output, exit 1                                                                        |
| Lockfile            | `pnpm install --frozen-lockfile`                                                                                                                                                                                       | exit 0                                                                                   |
| Repo gate           | `pnpm gate:repo`                                                                                                                                                                                                       | exit 0                                                                                   |
| Full local gate     | `pnpm check:local` after the last edit                                                                                                                                                                                 | exit 0                                                                                   |
| Changeset demand    | the `changeset-management -- check <base-sha>` entry point at the pin in `.github/workflows/changeset-check.yml`, base `origin/main`                                                                                   | no missing intent (KTD2, KTD4)                                                           |
| No new suppressions | `git diff origin/main...HEAD`                                                                                                                                                                                          | no added `.skip`, `.only`, `oxlint-disable`, `@ts-expect-error` or mutation baseline row |
| Base                | `git merge-base --is-ancestor origin/main HEAD` after merging `origin/main` up                                                                                                                                         | exit 0; no rebase, no force-push                                                         |
| CI                  | `xd://github` `run_watch` on the PR head                                                                                                                                                                               | all checks green                                                                         |

---

## Definition of Done

- R1-R8 hold on the PR head.
- Commits follow KTD5 (gate wiring, then the Evaluator action edit, then the package deletion), each message `type(scope): subject` per REPO-C1.
- No scratch scripts, stub files or partial edits remain in the diff.
- The PR body names no private repository.
