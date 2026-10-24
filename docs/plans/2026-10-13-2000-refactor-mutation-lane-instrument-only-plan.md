---
title: Cut PR #733 down to the Mutation lane instrument, and meet the nightly rule
type: refactor
status: active
date: 2026-10-13
artifact_contract: ce-unified-plan/v1
supersedes: docs/plans/2026-10-09-mutation-main-green.md
---

# Cut PR #733 down to the Mutation lane instrument, and meet the nightly rule

## Goal Capsule

- **Objective:** #733 merges as a change to the instrument only: the nightly Mutation lane, its planner, its tools and its docs. It carries no baseline, no debt seed, no validator that grades #733's own baselines or configs (the `repo-checks` `mutation-baseline` and `mutation-config` gates leave), and no survivor-killing work. On main it meets `compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md` clause by clause. The lane's own `stryker gate` step stays: it is how survivors on main fail (R4).
- **Authority:** the root's ruling of 2026-10-13 19:25 UTC (chat-276) and its 19:28 and 20:05 addenda. `repos/constitution/ENFORCEMENT.md:22-25,29`, CONST-G3 (`:278-280`) and CONST-G4 (`:281-283`).
- **Proof:** the first night on main. It runs every enrolled project, because this PR changes the lane's own inputs. Every planned package reports completely and every failure carries its reason code.
  - That night is red by design, and it is routed.
  - **Steady state:** until the survivor unit lands, main keeps the survivors the leaving baselines held. No night can then record green, so every night runs all 14 enrolled projects, about 180 job-min (`mutation.yml:1-8`).
  - U4's base search and U3's green line are first exercised on the first green night after the survivor unit lands.
- **Not this plan:** gate and debt-seed design (unit M, chat-358), survivor kills (a separate unit the root stands up after the plan gate), and the stryker-js-effect bump.

## Product Contract

- **State.** `fix/mutation-lane` is at `5f13965cbf`. That is #733's head `2e9adabb23` plus two plain merges of `origin/main`, unpushed: `219545b0f3` (#762 `de684e25d6`) and `5f13965cbf` (#737 `279670c954`, signed). The diff against `origin/main` is 156 files.
  - On that tree the tools suite passes 157/157.
  - `pnpm gate:repo` exits 0.
  - Main holds no `mutation-baseline*` file and no `repo-checks` mutation check (`git ls-tree origin/main`).
- **R1.** Every file in #733's diff either stays as the instrument or leaves with a named destination and owner. Gates go to unit M as written proposals, never as code in #733.
- **R2.** Each item carries a CONST-E7 ruling with file:line, or a CONST-G4 purpose argument with evidence.
- **R3.** The lane meets each clause of `mutation-runs-nightly-on-main.md:22-30` that judges a lane with no triage. `:114`: no triage job exists in this organisation yet. #762's re-worded ci-wall-clock rules and #737's three edited rules are re-ruled on their current text. A clause the house law overrides is named in D4, never silently dropped.
- **R4.** Without committed baselines, every survivor still fails its project's gate.
- **R5.** The final receipt is produced only after the root says go, on the final head.

## Decisions for the root

- **D1. Red-night channel.** The Routing clause (`:28`) makes a red night one fix task. It is an issue where the repository has issues; otherwise a comment on each culprit merge's pull request; otherwise the run's step summary with the job red, which `:28` calls "never the only delivery".
  - The task must mention the opener of every candidate merge's pull request when attribution is ambiguous. That is every night for a lane with no triage, so every channel notifies the same authors.
  - A night that shows what an open task already names must update that task and never file another.
  - This repository has issues disabled (`has_issues=false`, REST).
  - The options differ in container and permission:
    - (a) Enable Issues and give the lane `issues: write`: one updatable issue per open finding set. This is a repository setting, so it needs the operator.
    - (b) `pull-requests: write` and one comment per candidate merge: about 11 a night (10.9 first-parent commits a day, `mutation.yml:7-8`). There is no single task to update.
    - (c) Step summary only.
  - **Recommendation: (a).** It is the only channel that holds one task the lane can update night after night, as `:28` requires. U3's routing step is written after this ruling.
- **D2. Cause-C fixes stay in #733 (G4).** 16 corpus fixtures and the vitest frame-owner change (below) fix a test failure seen only inside the Stryker sandbox. They kill no mutant, and none of their packages is graded for them: `runner/vitest` has no `mutation` script, and fixtures are outside `workflowMutate` (`base.js:14-21`). The root may rule that they leave too.
- **D3. Who tells a night that wrote no record.** Two cases leave a red night with no record and no task:
  - a startup-failed run;
  - a failure of the `night` job itself (an API, artifact or permission failure).

  The no-triage clause (`:22`, "so no night is red with nobody told") then rests on the root-owned triage cron noticing a schedule run with no record. If that cron is meant to be the rule's triage job, U3's routing shrinks to the record and the green line.
- **D4. `merge` and `gate` reproduce.** `failures-name-the-gate-and-location.md:19` keeps a local command for a step that only reads Stryker's output, such as merging. The house law, as given at 15:00 UTC on 2026-10-13, says "No Stryker of any kind locally". The plan follows the house law and reproduces `merge` and `gate` through the dispatch (U5). The root confirms that, or amends the rule's clause.

## E7 inventory: what stays and what leaves

ENFORCEMENT `:22` says an instrument change lands alone, by hands that do not hold the work it judges. `:24` says a baseline written by the same hands is the same cheat. `:29` says a baseline is suppression.

| What (files at `5f13965cbf`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Disposition                                                     | Owner                                   | Ruling                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane workflows and actions; planner and tools (`scripts/tools/{mutation-admit,mutation-admission,mutation-plan,mutation-probe,stryker-reads,record-pricing,run-reuse,job-attempt,mutation-matrix,test-timings}*`); the deletions of main's `scripts/tools/{mutation-job,mutation-job.test,build-mutation-summary}.ts` (main's report path, replaced by the lane's `merge` and `report` jobs); `flake.nix`; `scripts/deno.jsonc`; `.github/mutation-seed-costs.json`; `.github/AGENTS.md`; `CONCEPTS.md`; three `docs/solutions` files | Stays                                                           | #733                                    | Instrument (`:22`).                                                                                                                                                                                  |
| 14 `stryker.config.ts`; `packages/toolchain/stryker-config` (`lib/base.js`, `.d.ts`, README); `.changeset/curvy-dragons-explain.md`; `nice-jeans-design.md` (main's, +1 -1)                                                                                                                                                                                                                                                                                                                                                           | Stays                                                           | #733                                    | Instrument config. The `ignorePatterns` fix (`base.js:33`) is D8's root cause.                                                                                                                       |
| Cause C: 16 `tests/__fixtures__/failure-corpus/*` files (commits `8e08e342ee`, `2e5656779c`); `packages/runner/vitest/src/{failure,internal/call-site,internal/workspace-relative-path}.ts` and `tests/call-site.runner.test.ts`; `.changeset/dry-melons-fail.md`; the mutated-set lines in `effect-daemon-microvm/AGENTS.md` and `sim/differential-spec/AGENTS.md`                                                                                                                                                                   | Stays (G4, D2)                                                  | #733                                    | Fixes the sandbox-only failure location. Kills nothing.                                                                                                                                              |
| 14 `mutation-baseline.json` and 10 `mutation-baseline.reasons.md` (all added by #733; 67 ids: 66 debt, 1 justified); `scripts/tools/repo-checks/mutation-debt-seed.json`                                                                                                                                                                                                                                                                                                                                                              | Leaves; deleted from #733                                       | Unit M decides whether debt seeds exist | Suppression (`:29`) by the lane's hands (`:24`).                                                                                                                                                     |
| `repo-checks` `mutation-baseline` and `mutation-config` (4 files plus the `cli.ts` registration); `package.json:20`; the planted block in `.github/actions/checks-lane/action.yml`                                                                                                                                                                                                                                                                                                                                                    | Leaves; proposals P1–P3 via chat-288, code kept at `5f13965cbf` | Unit M                                  | New gates that grade #733's own output (`:22`, G3). `checks-lane` reverts wholly to main's: main's `npm:effect@` plant still trips `deno-locks`, because `mutation-admission.ts:5` imports `effect`. |
| Survivor kills: 46 files, 9 commits, 750 mutant ids (manifest below); `.changeset/{shiny-birds-switch,smooth-ducks-destroy,little-lions-pump,warm-camels-wonder}.md`                                                                                                                                                                                                                                                                                                                                                                  | Leaves; restored to main's in #733                              | The survivor unit                       | Graded work by the instrument's hands (`:22`).                                                                                                                                                       |
| `docs/plans/2026-10-09-mutation-main-green.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Replaced by this plan                                           | #733                                    | `single-plan` admits one plan per branch.                                                                                                                                                            |

After the cut #733 touches about 74 files, before U2–U5 add theirs: 156 − 24 − 6 − 46 − 4 − `package.json` − `checks-lane`.

### Survivor-unit manifest

The full list is `.mutation-evidence/survivor-unit-manifest.json` (scratch). Every file restores from `5f13965cbf`. The move is by file, never by revert, because `2e5656779c` mixes lane, fixture and kill work.

| Package                       | Files                                                                                                                                                          | Commits                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `discern`                     | 12: `ContentAddress.schema.ts`, `EvalReport.schema.ts`, `PatternAst.schema.ts` (`:48` `// Stryker disable`), 5 `src/__tests__/*.property.test.ts`, 4 `tests/*` | `f03b7c6ecd` `435eee49d4` `e101d01926` `dc479e5533` `da0be01000` `90e572f87d` `2e5656779c` |
| `effect-microsandbox`         | 7: 3 schema in-source tests, 3 property tests, `classify-probe-observation.workflow.ts:76` (emptied `InstrumentationBrand`)                                    | `2e5656779c` `65cd2fe50f`                                                                  |
| `effect-daemon-microvm`       | 2: `WorkloadExit.schema.ts`, `classify-workload-exit.workflow.ts:9` (emptied brand)                                                                            | `2e5656779c`                                                                               |
| `effect-daemon-socket`        | 2: `socket-failure.schema.ts`, `socket-termination.schema.ts`                                                                                                  | `2e5656779c`                                                                               |
| `oxlint-plugin-dmmf-workflow` | 10 RuleTester files                                                                                                                                            | `2e5656779c` `b80306e35b`                                                                  |
| `oxlint-plugin-effect-schema` | 13 RuleTester files                                                                                                                                            | `2e5656779c`                                                                               |

Mutant ids:

- **Small packages:** 25 from the old plan's D1 (`5f13965cbf:docs/plans/2026-10-09-mutation-main-green.md:391-420`: socket 7, microsandbox 17, microvm 1).
- **Brand maps:** 4 from D2 (`:421-429`).
- **Plugins:** 676 from D3 (`:430-1001`: effect-schema 439, dmmf-workflow 237).
- **Measured kills:** 45 that disappeared between dispatch runs 38095184480 and 38115511598 (discern 44, microsandbox 1).

Only 22 of the 750 ids sit on `*.workflow.ts` files the lane still mutates (D1 3, D2 4, discern 15). Since #747 the plugins are unenrolled, and the other ids sit on schema files outside `workflowMutate`. The survivor unit should start from the first night's report rather than from these ids.

### Gate without baselines (R4)

At stryker-js 17.0.2, `gateReport` (`packages/stryker-js/src/run-request.cell.ts:442-478`) checks survivors only inside `Effect.forEach(Option.toArray(gate.baseline))`. The outcome depends on what `--baseline` points at:

- **No `--baseline`:** no survivor is checked.
- **A missing file:** every project is refused (`gate-new-survivors.workflow.ts`, `baselineUnusable`).
- **A file with `survivors: []`:** every survivor is rejected (`clearedOrRejected`).

So the merge and batch gates (`reusable-mutation.yml:686-691`, `:754-758`) use `--baseline "$RUNNER_TEMP/accepted-none.json"`, holding `{"schemaVersion":1,"survivors":[]}`, which the job writes and never commits.

This is no new gate. It keeps main's verdict: `thresholds.break: 100` (main's `base.js:108`, graded per row by main's `mutation-job.ts:357-359`), now applied to runs split into shards, which log below break without failing (run 38115511598: memfs's batch passed with 6 survivors). An accepted set with no ids suppresses nothing (G4 on `:29`).

The `mutation-baseline-missing` code is deleted (DEL1) from its sites:

- `reusable-mutation.yml:686-690` and `:773-774`
- `failure-summary/action.yml:71`
- `.github/AGENTS.md:21,43`

`base.js:33` returns to main's `['reports', 'coverage']` (main `:105`). The changeset sentence (`.changeset/curvy-dragons-explain.md:5`) and the stryker-config README line go too.

## Proposals for unit M (routed through chat-288, not built)

| Proposal                                 | What it guards                                                       | Failure it catches                                                                                        | Evidence                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| P1 `mutation-config`                     | A mutated config spreads `sharedConfig` and sets no `ignorePatterns` | D8: 21 of 26 configs set `ignorePatterns: []`, so every open-closure and static mutant re-ran every night | `.mutation-evidence/plan-crawl-probe.out` (36→37 crawled files); runs 38109196324 and 38115511598 |
| P2 `mutation-baseline`                   | One reason row per id, and debt only shrinks                         | A widened baseline hiding a regression                                                                    | Only if unit M keeps baselines (`:29`)                                                            |
| P3 Planted-violation self-test for P1/P2 | The gate can still fail                                              | A vacuous gate (CHK1)                                                                                     | Needs GATE1 sign-off                                                                              |

## Nightly rule, clause by clause (lane at `5f13965cbf`)

In this table a bare `:N` in the Clause column is a line of `mutation-runs-nightly-on-main.md`. In the Now column it is a line of `.github/workflows/reusable-mutation.yml`. Other files are named.

| Clause                                                                                                                                                                        | Now                                                                                                                                                           | Unit   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Triggers `:22`: schedule + dispatch only                                                                                                                                      | Complies: `mutation.yml:11-14`. Consumer fixture calls only the guard action (`.github/AGENTS.md:45`)                                                         | —      |
| Triggers `:22`: a lane with no triage writes the night's record and routes a red night                                                                                        | Violates: no record, no routing                                                                                                                               | U3     |
| Main only `:23`: the first job refuses a non-default ref before installs; `sha` checked with `merge-base --is-ancestor --`; default branch from `github.ref_name` on schedule | Violates: the guard refuses only PR and merge-group events (`mutation-event-guard/action.yml:13-19`)                                                          | U2     |
| Main only `:23`: every other job `needs:` the first                                                                                                                           | Partial: only `plan` and `sfs-deps` list `guard` (`:73`, `:374`)                                                                                              | U2     |
| Dispatch inputs `:24`: `sha`, `packages`, `night`; checkout of `inputs.sha`; plan refused on a bad `packages`; `run-name`                                                     | Violates: neither `mutation.yml` nor the reusable workflow's `workflow_call` inputs (`:5-30`) has them, and there is no `run-name`                            | U2     |
| Concurrency `:25`                                                                                                                                                             | Complies: `mutation.yml:16-18`                                                                                                                                | —      |
| Scope `:26`: newest `schedule` run whose night record says green                                                                                                              | Violates: newest successful run of any event (`:158`), on `BRANCH` from `github.event.repository.default_branch` (`:144`), which is empty on schedule (`:23`) | U4     |
| Scope `:26`: run everything when none is found or the lane's inputs changed                                                                                                   | Partial: none found → everything (`:160-173`). Inputs changed → nothing: a lane-only edit selects 0 `mutation` tasks (scratch-clone probe)                    | U4     |
| Scope `:26`: jobs sized by measured timings                                                                                                                                   | Complies: `:177-179`, `:294-295`                                                                                                                              | —      |
| Green `:29`: one line, plus a record that says green                                                                                                                          | Violates                                                                                                                                                      | U3     |
| Stryker-step reproduce (`failures-name-the-gate-and-location.md:18-19`)                                                                                                       | Violates: `gh run rerun … --failed` (`:368`, `:480`, `:885`); `failure-summary/action.yml:92` prints "reproduce locally"                                      | U5, D4 |
| Wall clock: 60-minute backstop                                                                                                                                                | Complies: every job (`:47`, `:75`, …)                                                                                                                         | —      |

## #762 and #737 rules, re-ruled on current text

| Rule                                               | Verdict                                                                                                                                                                       | Unit                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `failures-name-the-gate-and-location` (#762, #737) | Gate and location comply (step ids, `mutation-shard-failed`, #737's timed-out code). Stryker-step reproduce violates. The `merge` carve-out conflicts with the house law (D4) | U5                                  |
| `heavy-suites-judge-every-main-commit` (#762)      | Per-push clauses not matched (no push trigger). Run-id concurrency complies                                                                                                   | —                                   |
| `heavy-lanes-state-their-daily-minutes` (#762)     | Complies: `mutation.yml:1-8`                                                                                                                                                  | U6 restates it for the steady state |
| `red-main-reverts-its-culprit-same-day` (#762)     | Not matched (`:30`; root's E2)                                                                                                                                                | —                                   |
| `one-stuck-job-backstop` (#737)                    | Complies: 60 on every job; no tool cap; `dryRunTimeoutMinutes: 60` (`base.js:35`) is not below the backstop                                                                   | —                                   |
| `selection-and-caching-go-through-turbo` (#737)    | Closed-list comments comply (`:114`, `:154`, `:177`, `:294`). The lane-inputs fallback violates                                                                               | U4                                  |
| `local-gate-equals-pr-gate`                        | Not matched once `package.json:20` reverts to main's                                                                                                                          | U1                                  |

## #737 onto the surviving path

- **Run to completion.** `mutation-job.ts`, the file whose per-package cap #737 removed, stays deleted. #733 runs one Stryker process per job under the 60-minute backstop, and the report job names cancelled and timed-out jobs. #737's killed-package test has no subject in #733.
- **stryker-js 17/18/19 peer range.** Kept in `packages/toolchain/stryker-config/package.json`.
  - Every option key `sharedConfig` sets has the same schema line at 17.0.2 and 19.0.0.
  - The `plan`/`run`/`merge`/`gate` request schemas are identical (hash `b8e10105431b`).
- **`failure-summary.test.ts`:** 5/5 on the merged tree with flake-pinned `jq`.
- **For the stryker-js-effect bump PR (v19.0.0, after `9e81669b84`):**
  - `INCREMENTAL_CACHE_VERSION` goes 3→5 and records gain `engineDigest`, so a v17 record is discarded as `cacheLayoutChanged` (`admit-incremental-report.workflow.ts:74`).
  - [INFERENCE, not run] Its mutants then run as `noPriorRecord`, and `run-reuse.ts` fails the bump night as `mutation-prior-unread`, unless that PR expects a cold record or reads the plan's discard reason (`run-event.schema.ts`, `PlanReportDiscard`).

## Implementation Units

- **U1. Cut to the instrument.**
  - Restore the 46 manifest files and the 4 changesets to main's.
  - Delete the 24 baseline and reasons files, the debt seed, the 4 repo-check files and `cli.ts`'s registration.
  - Revert `package.json` and `checks-lane`.
  - Gate against `accepted-none.json`.
  - Delete `mutation-baseline-missing` and the baseline patterns.
  - Replace the old plan.
  - Verification: `git grep -nI mutation-baseline -- . ':!*.lock'` lists only `.changeset/changelogs`; `pnpm gate:repo`; the tools suite; `./bin/dprint check`.
- **U2. Main-only guard and dispatch inputs.**
  - `reusable-mutation.yml` gains `sha`, `packages` and `night` as optional `workflow_call` inputs, defaulting to empty, so pinned callers keep working. `mutation.yml` declares them as `workflow_dispatch` inputs, passes them through its `uses:` `with:` block, and sets the exact `run-name` from `:24`.
  - Every checkout, and the select step's turbo `head`, uses `inputs.sha || github.sha`.
  - A guard-job step, after a `fetch-depth: 0` checkout, refuses:
    - a ref that is not the default branch;
    - a `sha` that fails `git merge-base --is-ancestor -- "$SHA" "origin/$DEFAULT"`.
  - The step reads `DEFAULT` from `github.ref_name` on schedule. The shared `mutation-event-guard` action and its consumer contract stay unchanged.
  - New reason codes go in `failure-summary` and `.github/AGENTS.md:43`.
  - Every job `needs: guard`.
  - The plan job gains a `planned` output, the JSON list of the packages it planned.
  - `packages` is decided in a new pure module, `scripts/tools/mutation-night.ts` (T1).
- **U3. Night record, green line, routing.** Schedule runs only: a dispatch, a reproduce included, writes no record and routes nothing (`:27`).
  - A final `night` job needs every job and runs on `if: always() && github.event_name == 'schedule' && needs.guard.result == 'success'`.
  - It writes the artifact `mutation-night-<run_id>` (90-day retention). The artifact holds the range, verdict, conclusion, planned packages (the plan's `planned` output), reported packages, survivors, failures (job, reason, packages, reproduce), and every merge in the range as a candidate, with attribution pending.
  - The verdict is green only when the run concluded `success` and every planned package reported. `cancelled` and `timed_out` record red with that conclusion.
  - Green writes one step-summary line: `<run_id> <from>..<to> green`.
  - Red files the fix task on the D1 channel, mentioning every candidate merge's opener. When an open task already names a survivor or failure, the lane updates that task and files no other. When a night no longer shows what a task names, it says so on that task (`:28`).
  - The decisions live in `mutation-night.ts` (T2); the job is a thin shell.
- **U4. Scope through the record and turbo.**
  - The base is the newest `event=schedule&branch=$DEFAULT&status=success` run whose `mutation-night-<id>` record says green, searched over a bounded page. None found or expired means every project. Until the survivor unit lands, that is every night (Goal Capsule, Steady state).
  - The ancestor check stays.
  - `turbo.json` `tasks.mutation.inputs` lists `$TURBO_DEFAULT$` first, then `$TURBO_ROOT$/` paths for the lane's workflows, tools and `.github/mutation-seed-costs.json`. Today the task has no `inputs`; without `$TURBO_DEFAULT$`, a package's own source edit would stop selecting it.
  - Update the closed-list comment at `:154`.
  - The throwaway check reruns the scratch-clone probe. A lane-only edit must select all 14 enrolled projects, a source edit in one package must select that package, and a docs-only edit none.
- **U5. Reproduce.**
  - `plan`, `coverage`, `shard`, `merge`, `gate` and `batch` reproduce as `gh workflow run Mutation --ref main -f sha=<sha> -f packages='<json>'`, following the house law (D4). The plan's predicted job-minutes sit beside it, except on `plan`.
  - The report job, which only reports other jobs, reproduces as the whole lane's dispatch without `packages` (`failures-name-the-gate-and-location.md:18`).
  - The guard reproduces as its own check, as a literal.
  - `failure-summary` gains an optional label input, so the lane's line never reads "reproduce locally". #743 owns `:41,44` of that file, and this edits only the inputs block and `:92`.
- **U6. Docs and push.**
  - Update `.github/AGENTS.md:21-22,43`, `CONCEPTS.md`, the solution docs and the cost header for the steady state.
  - After the root's go: commit with hooks, one plain push, a `git ls-remote` check, and CI watched once.

## Test admission (default refuse)

| Candidate                                                                                                                                                                                                                                          | Verdict                  | Why                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 `mutation-night.test.ts`: a set `packages` that is not a non-empty array of known enrolled names refuses the plan; a valid one plans exactly those; unset plans every package on dispatch                                                       | Admit                    | Pure decision with a consumer-visible failure: a typo would plan nothing and record a green night. Oracle: `:24`                                         |
| T2 same file: green only on `success` with every planned package reported; cancelled or timed-out is red with that conclusion; candidates are the range's first-parent merges; an open task naming tonight's survivor is updated, never duplicated | Admit                    | Pure decision. A partial report recorded green would skip packages from every later range, and a duplicate task per night breaks `:28`. Oracle: `:26-29` |
| Guard refusal under bash                                                                                                                                                                                                                           | Refuse                   | Process spawn over workflow text. Read-verified and actionlint-checked; residual below                                                                   |
| Reproduce label wording                                                                                                                                                                                                                            | Refuse                   | Wording test                                                                                                                                             |
| turbo selection                                                                                                                                                                                                                                    | Refuse (throwaway probe) | turbo is its own oracle                                                                                                                                  |
| Empty accepted set rejects survivors                                                                                                                                                                                                               | Refuse                   | Stryker behaviour, verified from source. No local Stryker                                                                                                |

Leaving tests: `repo-checks/mutation-{baseline,config}.test.ts` go with their checks. `failure-summary.test.ts` drops any case that names the deleted code.

## Risks and residuals

- **Off-main refusal is unexercised.** The only proof would be a refused dispatch on a branch, which house law bars. It rests on reading.
- **A night with no record is silent to the lane** (startup failure, or the `night` job's own failure). It goes to the root's cron (D3).
- **#743 overlaps `failure-summary/action.yml`** in different hunks, so a textual conflict is possible.
- **The full matrix runs every night** until the survivor unit lands (Steady state).

## Final receipt (after go and ce-work)

- **Review:** a fresh full-path `ce-code-review` on the final head, naming each lens's served model from the transcripts.
- **Rule rulings:** every loaded rule's `applies_when` ruled with its reason:
  - all of ci-wall-clock, including `one-stuck-job-backstop`, `setup-under-a-minute`, `no-dev-shell-on-verdict-lanes`, `light-checks-run-the-pinned-tool`, `gates-share-one-job`, `pr-gate-runs-only-what-the-diff-affects`, `flake-outputs-build-once-on-main` and #762's rules;
  - mutation-discipline rule by rule with file:line;
  - boundary-testing for T1/T2.
- **CONST-E7:** a ruling per item.
- **Pack proof:** packs proved by the run's `packs.json`.
- **Bar:** CI green on the final head, the receipt in the PR body, nothing open.

## Verification Contract

No Stryker locally and no Mutation dispatch from this unit. The only evidence is the deno tools suite, `pnpm gate:repo`, `./bin/dprint check`, actionlint, turbo query probes in a scratch clone, and CI on the pushed head.
