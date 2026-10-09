---
title: Constitution Rewrite Adoption - Plan
type: refactor
date: 2026-10-09
topic: constitution-rewrite-adoption
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Constitution Rewrite Adoption - Plan

## Goal Capsule

- **Objective:** this repository runs on the rewritten constitution: nothing live cites a vacated id, and the test-discipline lint decides what applies to a test from what the test is and does.
- **Means:** three ordinary pull requests, landed in order, each cut from `main` after the one below has merged:
  1. A subtree pull of the merged constitution.
  2. Every live citation of a vacated id is re-pointed or deleted.
  3. The lane-keying plan (`docs/plans/2026-10-08-2300-fix-test-lane-keying-plan.md`) is restated into this document against the new `CONST-T12` and built.
- **Authority:**
  - Conductor brief 09 and ruling 10 (2026-10-09).
  - Carried forward: dated plans and `docs/solutions/` keep their old ids, plus rulings 01 to 03 and Q2/Q3 of the 2026-10-08 lane-keying brainstorm.
  - Ruling 10 fixes the 16-law set and the brief 09 T12 wording as the final text.
- **Gate:** no unit starts until the conductor sends "constitution merged at `<sha>`". Each unit's first act is to re-read the constitution at that SHA.
- **Stop conditions:**
  - The text at the merged SHA differs in substance from the 16-law set, the brief 09 T12 wording, the D1 wording in ruling 10, or the id map. Only the unit that finds the mismatch stops.
  - A vacated id's destination (live law, absorbing entry, judging rule, or retired) cannot be read at the merged SHA.
  - Unit 3 needs a module-graph key that no compiling probe can produce (Q13 of the 2300 plan).

## Product Contract

### Problem Frame

On 2026-10-09, `repos/constitution/` is vendored at upstream split `693a6d7e90`, which is also upstream `main`. That text has 36 ids.

The rewrite keeps 16 ids: D1, D2, D4, B1, B4, N1, N3, S1, S2, S4, T8, T10, T3, T12, W1 and E7. It adds three judging rules (the G family) in `ENFORCEMENT.md`, absorbs 14 ids and retires 3 (D3, W2, W3). Once the pull lands, any live surface citing a vacated id points at nothing.

The test-discipline plugin still picks requirements by filename suffix and directory segment. The new T12 reads: _"Decide what applies to code (which checks, tests and requirements) from what it is and does, never from its name or location."_

That is wider than the amendment the 2300 plan was written against in two ways:

- It decides which tests apply, not only which requirements.
- It forbids keying on location as well as on name.

### Requirements

**Unit 1: vendor pull**

- R1. `repos/constitution/` equals the tree of upstream `main` at the merged SHA, brought in through the route `guard-git-subtree` allows, never around it: `git fetch <constitution url> main:refs/remotes/vendor/constitution`, then `git ls-tree refs/remotes/vendor/constitution` to check the fetched tree, then `git subtree pull --prefix=repos/constitution refs/remotes/vendor/constitution --squash -S -m "..."`.
- R2. The pull request merges with the **merge** method, so the squash commit stays reachable as a merge's second parent.
  - The earlier pulls `a539a27dac`, `b73e74106f` and `6d12de76be` are all two-parent merges, landed through #575 and #499.
  - Squash-merging the pull request flattens that.
- R3. No file outside `repos/constitution/` changes in this unit, and that includes plan files.
  - The root `CONSTITUTION.md` is a symlink into the subtree (mode `120000`), so it follows automatically.

**Unit 2: consumer id migration**

- R4. No live surface cites a vacated id.
  - "Live" means everything outside `repos/`, `docs/plans/`, `docs/solutions/`, `docs/residual-review-findings/`, `**/CHANGELOG.md`, `.changeset/changelogs/` and `.omp/rules-corpus/` (rulings 09 and 10).
  - Those excluded paths are history and keep their ids.
- R5. A citation of an absorbed id is replaced by the id of the entry that absorbed it only when that entry states the cited obligation. Otherwise the citation is deleted.
  - For `AGENTS.md:36`, "the cited obligation" is the words "loosening a constraint".
  - If the entry that absorbed `CONST-E9` does not state them, the parenthetical is deleted.
- R6. A citation of a retired id is decided citation by citation:
  - If another live law states the obligation, re-point to that law.
  - Otherwise delete the citation.
  - If the code or check exists only to serve the retired law, delete it too (`CONST-S4`).
  - For `CONST-D3`, ruling 10 settles this. The new `CONST-D1` reads "Close your types so an illegal value cannot be constructed." Refinement lines ("never negative", "whole number") re-point to `CONST-D1`. Brand-only lines lose their citation, and the code stays.
- R7. Every id cited afterwards exists in the vendored `CONSTITUTION.md` or `ENFORCEMENT.md`.

**Unit 3: lane keying, rebased on the new T12**

- R8. Every requirement in `oxlint-plugin-test-discipline` selects its files by what the file imports or calls.
  - No requirement reads a suffix, filename or directory segment to decide whether it applies.
  - A rule may read a name or location only when that name or location is what it judges (naming, placement). It may never use one to decide whether a different requirement applies (ruling 10, Q-E).
  - `RAW_VITEST_PACKAGES` and `isRawVitestPackage` are deleted.
  - This restates 2300 R1, R3, R4, R5, R8 and R17.
- R9. Content-identical files get the same findings regardless of name **or location**, except from naming and placement rules.
  - 2300 R2 and R14 widen from rename-invariance to rename- and relocation-invariance.
- R10. A suffix stays only as a name, checked against the lanes the imports select (2300 R6, KTD4). It never triggers a requirement.
  - The out-of-`src/` scope of `test-suffix-outside-src` is restated as a placement verdict that feeds the naming check. It is no longer a gate on whether the naming requirement applies.
- R11. The tests the pull-request lane runs are not chosen by `.conformance.test.ts`. Rulings 10 and 11 pick between two options by measured wall time:
  - **(b):** delete the PR-lane split (`VITEST_LANE`, `laneLeavesOut`, `CONFORMANCE_GLOB` in `base.js`; the `VITEST_LANE=pr` export at `checks-lane/action.yml:170`; `VITEST_LANE` in `turbo.json:82`), and rewrite the `.github/AGENTS.md:18` runbook line that describes the split.
  - **(a):** select the `conformance` project by import of `@systemfsoftware/conformance-spec`.
  - **Decision rule:** measure the whole pull-request run's wall time, either from the same PR's CI with and without the split, or against the median of the last 5 PR runs on `main`. Choose (b) if that time grows by no more than 3 minutes or 20%, whichever is larger, and no test job comes within 80% of its `timeout-minutes`. Otherwise choose (a).
  - The PR body records the run ids and durations.
- R12. The instrument and the corpus migration have different owners and land in separate commits (2300 R16; `CONST-E9`, or whatever absorbs it).
  - The instrument is the plugin, plus `vitest-config` under option (a).
- R13. This plan file ships in unit 3's pull request, the only plan file that pull request adds (`REPO-D2`). Units 1 and 2 carry no plan file.

### Acceptance Examples

- AE1. **Covers R1, R2.** After merge:
  - `git rev-parse <merge>^2` is the squash commit.
  - Its `git-subtree-split` trailer equals the merged SHA.
  - `git rev-parse HEAD:repos/constitution` equals that commit's tree.
- AE2. **Covers R4 to R7.** At unit 2's head:
  - The census under U2 prints 0 live hits for all 17 vacated ids.
  - Each replacement id is found by `grep -c 'id: CONST-<X>'` in the vendored files.
  - The five refinement lines cite `CONST-D1`.
  - The four brand-only lines cite nothing.
- AE3. **Covers R4 history.** History counts per vacated id equal those at `origin/main` (103 in total; see Sources).
- AE4. **Covers R8, R9.** One fixture that imports `@systemfsoftware/trace-spec` gives the same findings from every rule except naming and placement under each of these names:
  - `x.trace.test.ts`
  - `x.integration.test.ts`
  - `packages/runner/vitest/tests/x.trace.test.ts`
- AE5. **Covers R11.** A file that imports the conformance harness runs in the pull-request lane under (b), or not under (a), whatever its name. Renaming it away from `.conformance.test.ts` changes nothing.

### Scope Boundaries

- Upstream `systemfsoftware/constitution` is an input. Nothing here edits it, comments on its pull requests, or edits `repos/` by hand (`REPO-S3`).
- PR #687 (`chore/distributable-guards`) belongs to another workstream.
  - Nothing here edits it, comments on it, stacks on it, or waits for it.
  - Whichever pull request lands second resolves any overlap.
- The history paths in R4 keep their old ids.
- No new lint rule, CI grep, tripwire, or committed one-off script. The census is a command in this document, not a file.
- No local stryker or mutation run.
- Out of scope:
  - `guardExemptions` keyed on the package name (`base.js:73,146`). It is a follow-on outside this work.
  - The Vitest `**/*.test.ts` include glob, which stays.
  - Production-code filename contracts (`.schema.ts`, `<stem>.workflow.ts` in `schema-declaration-location`).
  - Stryker `mutate` globs.

### What does not count as done

- **Unit 1:**
  - Squash-merging the pull request.
  - Hand-copying files.
  - Pulling #27's head or any ref other than upstream `main` at the merged SHA.
  - Pulling before the conductor's merged-SHA message.
  - Any edit under `repos/` after the pull.
  - Any file outside `repos/constitution/`.
- **Unit 2:**
  - Find-and-replace from an old id to a new id without checking the obligation.
  - Leaving a vacated citation "for later".
  - Re-pointing `AGENTS.md:36` to an entry that does not state "loosening a constraint".
  - Rewriting history paths.
  - Waiting on #687.
- **Unit 3:**
  - Fixing only the five audited rules while `behaviour-exercises-use-case`, `behaviour-one-feature-per-file` and `no-pseudo-gherkin-unit-tests` still gate on `isBehaviourBasename`.
  - Keeping the suffix as a fallback or "hint", or as a selector with a consistency check beside it.
  - Exemption allowlists, `warn` severity, or disabling rules for runner packages.
  - Renaming files to dodge findings.
  - An inert module that no rule reads.
  - Instrument and migration in one commit, or by one owner.
  - Choosing (a) or (b) without the timed run recorded in the PR body.
  - Stacking on #687.

## Planning Contract

### Key Technical Decisions

- KTD1. **Three sequential pull requests, each based on `main`.** (Ruling 10; this replaces the stack in brief 09.)
  - Unit 1 opens as soon as the merged SHA arrives.
  - Unit 2 is cut from `main` right after unit 1 merges.
  - Unit 3 is cut from `main` after unit 2 merges.
  - None of them stacks on another workstream's pull request, and none publishes with `gh stack`. Ruling 10 overrides the harness stacking default (OP13b) for this work.
  - The conductor verifies and merges each one, pinned. Nothing is auto-merged.
- KTD2. **Unit 1 uses the merge method.** The evidence:
  - The repository allows merge commits: `allow_merge_commit: true`, and the ruleset's `allowed_merge_methods` is `["squash","merge"]`.
  - #687's `repo-checks subtrees` accepts only a squash commit that is a merge's second parent, never one on the first-parent chain (#687 `scripts/tools/repo-checks/subtrees.ts`, header comment).
  - GitHub's squash-and-merge is a known way to break `git subtree` history (git issue tracker 236109688).
- KTD3. **Unit 3 restates the 2300 plan into this document; it does not replace it.**
  - Carried over: U1 to U8, KTD1 to KTD8, AE1 to AE6 and AE10, and the Q13 escalation.
  - Changed:
    - The Dependencies quote and the stop condition use the brief 09 wording.
    - The authority line drops `CONST-N2`, `CONST-T14` and `CONST-E9` (all vacated) in favour of whatever absorbed them.
    - U0 is answered by Sources below.
    - R9, R10 and R11 widen the invariance, the placement reading and the scheduling scope.
  - The untracked 2300 plan file is deleted locally once the restatement is written, so it never ships.

### Sources and Research

- **Vendor history** (`git log -- repos/constitution`):
  - The last squash is `Squashed 'repos/constitution/' changes from 37c076f..693a6d7`, split `693a6d7e90`.
  - Merge `a539a27dac` (2026-10-01) has parents `41736621b7 b344973bfa`.
  - Earlier merges are `b73e74106f` (2026-09-23) and `6d12de76be` (2026-09-13).
  - `subtrees.toml` has `name = "constitution"`, `branch = "main"`.
- **Upstream refs on 2026-10-09:**
  - `main` is `693a6d7e90`.
  - No rewrite branch is published; ruling 10 says the rewrite is uncommitted upstream.
  - Open PR #27 (`fix/t12-n2-suffix-conflict`, `701db30ef4`) still has 36 ids and the old T12 text.
- **The subtree guard:** `.claude/settings.json`'s Bash matcher runs `agent-plugins/git-subtrees/src/guard-git-subtree.ts`, which refuses a `git subtree add|pull` given a URL (`URL_PATTERN`, `:8`) or without `-S`/`--gpg-sign` (`:57`). #687 keeps this hook. R1's fetch-then-pull route is the one it allows. Separately, `.claude/hooks/guard-protected-writes.ts:72` refuses `repos/` writes through the Write and Edit tools.
- **Census at `origin/main` `1f619061d0`** (vacated id: history / live):
  - B2 3/0, B3 16/0, B5 7/0, B6 3/0, D3 1/**9**, E9 12/**1**, N2 12/0, P1 11/0, P2 9/0, P3 10/0, S3 7/0, T9 1/0, T13 0/0, T14 2/0, T15 1/0, W2 2/0, W3 6/0.
  - History here uses the R4 paths.
  - Live hits:
    - `AGENTS.md:36` cites `CONST-E9` ("governs loosening a constraint").
    - `CONST-D3` appears in JSDoc on branded or refined schemas:
      - Refinement lines: `packages/runner/vitest/src/internal/property/error.schema.ts:14,26,359` and `src/replay.schema.ts:21,53`.
      - Brand-only lines: `src/internal/provided.ts:8` and `src/replay.schema.ts:14,29,108`.
  - Live citations of kept ids, unchanged unless their text moved:
    - D4: `compound-packs/schema-laws/README.md:5` and `tagged-unions-over-state-by-presence.md:8,11`.
    - T10: `packages/runner/vitest/tests/property-replay.test.ts:8`.
    - T3: `packages/daemon/effect-daemon-cluster/AGENTS.md:14`.
  - No CONST id appears in lint rule metadata, guard or check messages, rules directories, test names, or `.omp/rules/`.
- **How pull-request CI selects conformance files** (answers 2300 U0):
  - `.github/workflows/ci.yml:63-64` passes `profile: local` on `pull_request` and `per-change` otherwise.
  - `.github/actions/checks-lane/action.yml:167-170`: when `lane == 'test' && profile == 'local'`, the action writes `CONFORMANCE_PROFILE=local` and `VITEST_LANE=pr`.
  - `turbo.json:81-82` hashes both variables into `test`.
  - In `packages/toolchain/vitest-config/lib/base.js`:
    - `:9` sets `CONFORMANCE_GLOB = '**/*.conformance.test.ts'`.
    - `:17-18` (`hasConformanceFiles`) globs on it.
    - `:25` is `isPrLane`.
    - `:154` sets `laneLeavesOut = isPrLane() && conformanceFiles`.
    - `:264` excludes the glob from the unit project.
    - `:281,338` build a `conformance` project, or drop it when `laneLeavesOut`.
    - `:306,324` strip it from projects a package declares itself.
  - Commit `03567f9d8d` (#526, 2026-09-24) introduced the split.
  - Result: pull requests run no `*.conformance.test.ts`. Pushes to `main`, `merge_group` and `workflow_dispatch` run them under `per-change`.
  - The root `check:local` (`package.json:27`) sets no `VITEST_LANE`, so local runs include conformance files.
  - Population:
    - 18 `*.conformance.test.ts` files in 14 package directories, all importing `@systemfsoftware/conformance-spec`.
    - 4 more import the harness without the suffix, all in `packages/sim/conformance-spec/tests/`. They run on pull requests today.
    - 2 plugin rule tests contain the specifier only inside fixture strings.
  - Budget: `.github/AGENTS.md` and `scripts/tools/test-timings.ts` (`--target`) plan jobs of at most 5 minutes of predicted work.
- **Suffix and location keys in the plugin at `origin/main`:**
  - Keyed on `isBehaviourBasename` (`path.ts:40`): `behaviour-test-requires-gherkin.ts:43`, `behaviour-exercises-use-case.ts:141`, `behaviour-one-feature-per-file.ts:64`, `no-pseudo-gherkin-unit-tests.ts:54`.
  - Keyed on a suffix: `conformance-test-requires-harness.ts:87`, `differential-test-requires-harness.ts:31`, `trace-test-requires-taxonomy.ts:251`, `property-file-purity.ts:155,161`.
  - `RAW_VITEST_PACKAGES` (`path.config.ts:71`, `path.ts:22-23`) exempts directory segments in `test-suffix-outside-src.ts:19` and `vitest-from-systemfsoftware-vitest.ts:29`. `AGENTS.md` names it under `REPO-S5`.
- **Overlap with PR #687** (head `1a4af60e34`):
  - It edits `AGENTS.md` lines 29-69, `CONCEPTS.md`, `.github/actions/checks-lane/action.yml` (static-lane steps after line 59), `flake.nix`, `package.json`, `pnpm-workspace.yaml` and six `docs/solutions/` files.
  - It deletes `.claude/hooks/*` and `scripts/guards/*`.
  - Overlap per unit:
    - Unit 1: none.
    - Unit 2: `AGENTS.md:36`.
    - Unit 3: `AGENTS.md` (`REPO-S5`), and `checks-lane/action.yml:167-170` under option (b).
- **Probes:**
  - Wiki: `xd://mcp__software_wiki_qmd_query` is not mounted (raw error `No such tool`).
  - Test layer (`skill://test-layer-selection`):
    - Unit 3's rule tests stay RuleTester pairs whose oracle is the relation between two runs (2300 R14, `CONST-T10`).
    - Units 1 and 2 earn no test.
  - Destructive review: see Challenge.

### Challenge (destructive review, Inversion lens)

1. _Assumption: three units must be three pull requests._
   - The inversion: one pull request carrying the vendor pull and the lint rewrite would hold the pull until unit 3's review finishes.
   - Kept three. Ruling 10 orders them so that unit 2 follows unit 1 at once.
2. _Assumption: unit 2 is a rename._
   - The inversion: an absorbing entry may state a different obligation.
   - Changed: R5 makes the obligation the test, and ruling 10 names the words for `AGENTS.md:36`.
3. _Assumption: unit 3's scope is the plugin._
   - The inversion: the new T12 names which tests apply, so the PR-lane conformance split is a direct instance.
   - Changed: R11 brings it in, and ruling 10 settles which option.

### Risks

- **The rewrite is not yet readable.** Ruling 10 fixes the text, but every unit re-reads it at the merged SHA, and a mismatch stops that unit.
- **Stale window.** Between unit 1 and unit 2 merging, `AGENTS.md:36` and nine runner JSDoc lines on `main` cite vacated ids. Unit 2 follows immediately to keep the window short.
- **Unit 1 squash-merged by mistake.**
  - The vendored tree loses its squash anchor.
  - After #687 merges, `repo-checks subtrees` reports that as undecided or violated.
  - Recovery is a fresh pull, never a force-push.
- **#687 overlap.** Whichever of #687 and units 2 and 3 lands second resolves a one-line conflict in `AGENTS.md`, and for unit 3 under (b), one in `checks-lane/action.yml`.
- **Unit 3 widening.**
  - Under (b), 18 files join every pull-request run. That is the cost #526 avoided, and the timed run decides whether it is affordable.
  - Under (a), 4 more files leave the pull-request lane.
- **Clean-tree ordering.** `ENFORCEMENT.md` says to enroll over a clean tree, so unit 3's intermediate instrument commits fail `pnpm check:local` until the migration commits land. This is carried from the 2300 plan.

## Implementation Units

### U1. Vendor pull (PR 1, base `main`)

- **Start:** the conductor's "constitution merged at `<sha>`".
- **Success predicate:**
  - AE1 holds after merge.
  - At the merged SHA, `CONSTITUTION.md` has 16 ids and `ENFORCEMENT.md` has the three G-rules.
  - `pnpm check:local` exits 0, and CI is green.
  - If #687 has merged, `nix run .#repo-checks -- subtrees` exits 0.
- **Files:** `repos/constitution/**` only.
- **Verification:**
  - `git fetch https://github.com/systemfsoftware/constitution.git main:refs/remotes/vendor/constitution`, `git ls-tree refs/remotes/vendor/constitution`, then `git subtree pull --prefix=repos/constitution refs/remotes/vendor/constitution --squash -S -m "..."` (R1).
  - The `git-subtree-split` trailer equals `<sha>`.
  - `git rev-parse HEAD:repos/constitution` equals `<sha>`'s tree.
  - Upstream's `repos/constitution/scripts/validate-constitution.ts`, run read-only.

### U2. Consumer id migration (PR 2, base `main` after PR 1 merges)

- **Success predicate:**
  - AE2 and AE3 hold.
  - Each changed citation's commit names the law it now cites, or says the citation was deleted because the obligation is gone.
  - `pnpm check:local` exits 0.
- **Surface** (re-run the census at the head first):
  - `AGENTS.md:36`: re-point to the entry that absorbed E9 only if it states "loosening a constraint". Otherwise delete the parenthetical.
  - `error.schema.ts:14,26,359` and `replay.schema.ts:21,53` move from `CONST-D3` to `CONST-D1`.
  - `provided.ts:8` and `replay.schema.ts:14,29,108` lose their citation, and the code stays.
- **Census command** (read-only):

  ```bash
  rev=HEAD; ids='B2|B3|B5|B6|D3|E9|N2|P1|P2|P3|S3|T13|T14|T15|T9|W2|W3'
  hist='^(docs/(plans|solutions|residual-review-findings)/|[.]omp/rules-corpus/|[.]changeset/changelogs/)|(^|/)CHANGELOG[.]md$'
  git grep -nIoP "CONST-($ids)\b" "$rev" -- . ':!repos/**' | sed "s|^$rev:||" |
    awk -F: -v hist="$hist" '{ c = ($1 ~ hist) ? "history" : "live"; n[$3" "c]++; seen[$3]=1; if (c=="live") print "LIVE", $1":"$2, $3 }
      END { for (i in seen) print i, n[i" history"], n[i" live"] }' | sort -V
  ```

- **Files:** `AGENTS.md` and the three runner files. No plan file.
- **Changeset:** `@systemfsoftware/vitest` is publishable and its JSDoc ships in `.d.ts`. If the Changeset Check reports its build hash moved, add a `none` intent with `pnpm change --bump none`.

### U3. Lane keying on the new T12 (PR 3, base `main` after PR 2 merges)

- **First step:** run ce-plan to restate the 2300 plan into this document, per KTD3.
- **Success predicate:**
  - The 2300 Definition of Done, with R8 to R12 replacing 2300 R1, R2, R3, R4, R5, R6, R8, R14, R16 and R17. 2300 R7 (one owner per violation) carries over unchanged.
  - AE4 and AE5 reproduce.
  - This command returns nothing outside the naming rule's own suffix-to-lane table: `git grep -nE 'isBehaviourBasename|isRawVitestPackage|RAW_VITEST_PACKAGES|endsWith\((CONFORMANCE|TRACE|DIFFERENTIAL|PROPERTY_TEST)_SUFFIX\)' -- . ':!repos/**' ':!docs/plans/**'`
  - `CONFORMANCE_GLOB` is gone from `base.js` under (b), or replaced by an import-keyed selector under (a).
  - The PR body records the measured run ids and durations and the option the R11 decision rule picked.
  - `pnpm check:local` exits 0, and CI is green.
- **Verification:**
  - `pnpm --filter @systemfsoftware/oxlint-plugin-test-discipline test`
  - `pnpm --filter @systemfsoftware/oxlint-plugin-test-discipline api:check`
  - A scratch corpus lint run that is never committed.
  - `pnpm check:local`.
  - The CI `test` lane log shows which conformance files ran.
- **Owners:** the maker writes the instrument. A fresh-context subagent migrates the corpus in separate commits (R12).
- **Files:** this plan (the PR's only plan file), the plugin, `vitest-config/lib/base.js`, under (b) `checks-lane/action.yml`, `turbo.json` and `.github/AGENTS.md`, `AGENTS.md` `REPO-S5`, and the migrated corpus.

## Definition of Done

- Each unit is an ordinary pull request opened with `gh pr create`, based on `main` once the unit below has merged. There is no `gh stack` and no auto-merge.
- Each unit's head SHA is reported green. The conductor verifies and merges each one, pinned.
- AE1 to AE5 are shown at the relevant heads.
- No force-push, nothing tagged, no local mutation run, and no private repository named anywhere.

## Decisions (ruling 10)

- **Q-A:** `docs/residual-review-findings/`, `**/CHANGELOG.md`, `.changeset/changelogs/` and `.omp/rules-corpus/` are history (R4).
- **Q-B:** the conductor confirms the map at merge time. D3 is retired, and the new D1 wording decides the D3 lines. E9 re-points only if its absorbing entry states "loosening a constraint" (R5, R6).
- **Q-C:** (b) or (a) by the R11 decision rule (ruling 11). (c) is rejected because it contradicts T12 ("which ... tests"). The run ids and durations go in the PR body.
- **Q-D:** unit 1 ships at merge. Unit 2 follows immediately from `main` without waiting for #687. Unit 3 is cut from `main` after unit 2 and never stacks on #687 (KTD1).
- **Q-E:** a rule reads a name or location only when that is what it judges. `RAW_VITEST_PACKAGES` goes. `guardExemptions` is a follow-on, and the `.test.ts` include glob stays (R8, R10, Scope Boundaries).
- **Q-F:** rejected. The plan rides in unit 3, and units 1 and 2 carry no plan file (R3, R13).

## Open Questions

- Carried from the 2300 plan, Q13: which module-graph key, if any, covers the runner packages' own tests now that `RAW_VITEST_PACKAGES` goes. It is settled by a compiling probe in unit 3, or the probe is brought back to the conductor before anything that depends on it is built.

## Review Record

- ce-doc-review (2026-10-09), lenses: coherence, feasibility, scope-guardian, adversarial. No second-model reviewer was available on this host.
- Ruling 11 applied findings 1 to 5 and 7 as suggested and finding 6 as modified (R11 decision rule). The conductor accepted the plan without a re-run.
