---
title: Mutation runs nightly on main - Plan
type: docs
date: 2026-10-13
topic: ci-wall-clock-nightly-mutation
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-10-13-1612-docs-ci-wall-clock-nightly-mutation-plan.md
---

# Mutation runs nightly on main - Plan

## Goal Capsule

- **Objective:** `ci-wall-clock` states the house law for mutation once: a mutation lane runs once a night on main (`schedule` plus `workflow_dispatch`), never per push and never on a pull request, and a triage job after the night ties each new survivor and each lane or gate failure to its culprit merge and sends the fix to the agent that owns the repository. A green night is one line; a red night never goes to the human operator.
- **Means:** a new rule `mutation-runs-nightly-on-main` (R1-R5, R10-R11), the pack text that assumed a per-push mutation lane amended to match (R6-R9), and `failures-name-the-gate-and-location` giving a step that runs Stryker a dispatch on main as its reproduce (R12).
- **Product authority:** the root's intent of 2026-10-13 and the house law of 2026-10-12 (mutation nightly on main, schedule plus dispatch, never per push or per PR; a triage cron reads each night). Work item it_56f89f7b added two issues from the main-ci-green root: a Stryker step's reproduce is the lane's dispatch on main, never a local Stryker command or `--ref <branch>`; and whether the triage re-tests a candidate merge through the lane's dispatch inputs. The rule id, the file split, the wording and the evidence are derived here.
- **Stop conditions:** evidence that the nightly shape loses a verdict per-push mutation gave; a required edit to SL-owned `schema-laws` or `mutation-discipline` kill-survivors text.
- **Delivery:** one pull request off `main`, merged up to `0923912eed` (which includes #761), docs and pack text only; no workflow edit. #733 (open, not this workstream's) lands the nightly workflow.
- **Open blockers:** none.

## Product Contract

### Summary

A new `ci-wall-clock` rule owns the mutation lane's cadence, concurrency, triage and routing. `heavy-suites-judge-every-main-commit` keeps per-push verdicts for full-stack e2e and full-corpus lanes and hands mutation to the new rule. The other rules whose text or exemplars showed mutation as a per-push lane stop doing so.

### Problem Frame

- **Per-push mutation multiplied a whole-lane cost by the merge rate, and nobody owned the red.** From 2026-09-25 to 2026-10-09 this repo's Mutation lane ran on every push to main without one green run: 60 failed, 34 cancelled, 372 job-hours (`compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md:11`). #700 (`f9ebfc4f3a`) dropped the push trigger; main's `mutation.yml` has run on `workflow_dispatch` only since (`a578c704a4:.github/workflows/mutation.yml`). One whole-lane run took 87 and 108 jobs (runs 38115511598 and 38109196324, `78826f9f59:.github/workflows/mutation.yml:1-7`).
- **Per-push runs also lose verdicts.** In the public stryker-js-effect, 2026-10-10, #283's Mutation run 38072120191 was cancelled while pending, with no job started, when the next push queued (`heavy-suites-judge-every-main-commit.md:12`). A different repository and a different change from the first incident.
- **The pack still prescribes per push.** `heavy-suites-judge-every-main-commit` named mutation among the lanes that run on every push, with a per-push gritlint mutation exemplar; `heavy-lanes-state-their-daily-minutes`, `red-main-reverts-its-culprit-same-day` and `release-promotes-the-staging-proven-build` each showed a per-push Mutation lane in an exemplar. #733 lands the nightly workflow and would be graded against those rules.

### Key Decisions

- **A new rule, not an amendment.** The nightly lane's cadence, triage and routing are one subject that no existing rule covers; folding it into `heavy-suites-judge-every-main-commit` would contradict that rule's title and its per-push Concurrency and Scope bullets. Slug `mutation-runs-nightly-on-main`, id `ci-wall-clock/mutation-runs-nightly-on-main`.
- **Never on a pull request stays owned by `.github/AGENTS.md:21`.** The rule cites it and adds never per push.
- **Red-main's per-push machinery does not apply to a night.** A night covers several merges and has no push run, so the P0, freeze and automatic revert stay per-push; the triage is the night's red handling, and the owning agent decides between fix and revert.
- **Attribution never guesses.** A survivor is tied to the merge in the night's range that changed the mutated line; a failure to the merges touching the failing packages. One merge found is the culprit. Several found are re-tested before one is named (next decision). When the re-tests cannot decide, or none is found, the triage names every candidate and says so (SafeRevert's caution, already cited by `red-main-reverts-its-culprit-same-day`).
- **The triage re-tests through the lane's dispatch inputs.** A night covers about 10.9 merges (`0923912eed:.github/workflows/mutation.yml:7-8`), and #733 found four causes behind one red window, so several candidates is the normal case. The re-test reuses red-main's two runs before a revert (red at the commit, green at its first parent) with no new certainty bar: a scoped dispatch at the night's commit must show the survivor or failure again, then the candidates are bisected in merge order. Each dispatch states its predicted job-minutes first. Scope is by package, not by job name, because the plan packs jobs differently at another commit (`reusable-mutation.yml:197,208`).
- **The dispatch refuses a ref other than main.** GitHub lets a dispatch target any branch and tests that branch's last commit; the lane's guard refuses only pull-request and merge-queue events (`mutation-event-guard/action.yml:13-19`); Stryker refuses only outside CI (`stryker-js-effect 33c6175f:packages/stryker-js/README.md:189`). Eight dispatches ran the lane on branches (2026-08-07 to 2026-10-11). Documentation alone let all eight through, so the lane's first job checks the ref, and a commit other than main's tip comes in through `sha`, checked to be one main reaches. The cost: a lane repair is proven by the first dispatch on main after it merges.
- **A Stryker step reproduces by that dispatch, with its cost.** The mutation job's reproduce is a local Stryker run (`reusable-mutation.yml:282`), which REPO-D3 forbids and stryker-js-effect #168 made the engine refuse; the plan job's runs `stryker plan` (`:158`, `test-timings.ts:791-810`). The report job only merges parts and keeps its local command.
- **Other rules' per-push mutation exemplars are amended, not left.** They contradicted the new rule. Neutral exemplars rename their lane to `E2E`; `heavy-lanes-state-their-daily-minutes` cites main's nightly cost header (`4ae7e9e17c:.github/workflows/mutation.yml:1-9`, #747: priced per night, full corpus, measured on run 37962737026) as its RIGHT and keeps its merge rate for per-push lanes only. `heavy-suites-judge-every-main-commit`'s title and `applies_when` name full-stack e2e and full-corpus lanes. E2e and full-corpus rule substance is unchanged.
- **The enrolment `ref` guidance is a separate pull request.** pnpm-release-management#57 shows a short `ref` gives `roots=[]` with a "source skipped" warning, and the fix is a full 40-character SHA. It concerns how any repository enrols any pack, not mutation cadence, and one incident is its only evidence; it rides a pull request of its own.

### Requirements

- R1. A new rule `compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md` in the pack's format: frontmatter `title`, `applies_when` (mutation workflow triggers and concurrency, callers of a mutation workflow, the triage job and where it sends a result), `tags`; why from two independent public incidents; `## Rule`; WRONG/RIGHT with `<repo> <sha>:<path>:<line>`; a closing `Gate: review` question answered from the diff.
- R2. Triggers: one daily `schedule` plus `workflow_dispatch`; no `push`, `pull_request` or `merge_group`; no push- or PR-triggered workflow calls it. Concurrency: a group per run, never cancelled.
- R3. Triage: a `workflow_run` handler on the completion of the night's `schedule` run ties each new survivor and each lane or gate failure to its culprit merge in the night's range (from the newest `schedule` run that ended `success`), or to every candidate with the ambiguity stated. Its first step writes the night's record, an Actions artifact named for the night's run id that holds the range, the findings and every re-test's run id, and files the fix task where the repository has issues; only a run whose id that record holds continues it, and any other dispatch starts nothing. A re-test still running when the next night's triage starts leaves the attribution ambiguous. It accepts a night's run id to triage again.
- R4. Routing: a red night, or a triage that failed, is one fix task for the agent that owns the repository, as an issue, else a comment on each culprit's pull request, else the triage run's summary with its job red; never the human operator; the triage opens no revert. A green night is one line in the triage run's summary, and a night's record that says green, from which the next night reads its start. Until a triage exists, a lane with a `schedule` files that fix task itself on a red night, naming every merge in the range.
- R5. The rule says what is unproven: no triage job exists in the organisation yet.
- R6. README line 3 and the rule list name the nightly lane and the new rule.
- R7. `heavy-suites-judge-every-main-commit` keeps per-push verdicts for full-stack e2e and full-corpus lanes, hands mutation to the new rule, keeps mutation in its Reach list of main-only suites, and drops its per-push mutation exemplar and cost arithmetic.
- R8. `heavy-lanes-state-their-daily-minutes` prices a nightly lane by its night, with no merge rate; its RIGHT is main's nightly cost header from #747.
- R9. `red-main-reverts-its-culprit-same-day` scopes itself to per-push verdicts and points a nightly lane's red to the new rule; its neutral exemplar's lane, and the release rule's neutral trigger list, become `E2E`.
- R10. Main only: the mutation lane's first job fails a ref other than the default branch, and takes a commit other than main's tip only through `sha`, checked to be one main reaches. The lane accepts `sha`, `packages` (a JSON array) and `night` dispatch inputs (unset `packages` plans every package; a set one must be a non-empty array of known names) and titles each run with the commit it tests and, for a triage re-test, the night it is for. Every other job of the lane `needs:` the refusing first job.
- R11. Triage re-test: with several candidate merges, a scoped dispatch at the night's commit reproduces first, then the candidates are bisected; the culprit is red where its first parent is green; each dispatch's predicted job-minutes are stated first; otherwise every candidate is named as ambiguous. No triage job waits on a re-test: each dispatched run's completion starts the next step.
- R12. `failures-name-the-gate-and-location`: a step that runs Stryker reproduces through the lane's dispatch on main with `sha`, packages and predicted job-minutes, never a local Stryker command, and the summary shows it as a dispatch, not under a "reproduce locally" label; a step that only reads Stryker's output keeps its local command. A guard's refusal reproduces by running the guard's check on the refused event or ref, never by a dispatch the guard admits. No reproduce splices in a value a pull request's author chooses. The rule names this repo's three non-complying reproduce commands as the shared-tooling unit's input.

### Acceptance Examples

- AE1. **Covers R2.** A diff adds `push: branches: [main]` to `mutation.yml`: refused. A diff adds `schedule` with one daily cron and keeps `workflow_dispatch`: holds.
- AE2. **Covers R2.** A diff makes `ci.yml` (on `pull_request`) call `reusable-mutation.yml`: refused.
- AE3. **Covers R3.** A manual dispatch of the lane completes: no triage starts. The night's run is still running at an hour a cron would have picked: nothing reads it until it completes.
- AE4. **Covers R4.** A triage job that mentions the human operator on a red night, or opens a revert itself: refused.
- AE5. **Covers R7.** A full-stack e2e lane in the diff drops its push trigger for a schedule: `heavy-suites-judge-every-main-commit` refuses it, unchanged.
- AE6. **Covers R10.** A mutation lane's guard that checks only the event name, or a reproduce `gh workflow run Mutation --ref fix/x`: refused. A guard that fails `refs/heads/fix/x` and a `sha` main does not reach: holds.
- AE7. **Covers R11.** Three merges in the range touched the failing package; the triage job that starts the first scoped dispatch ends without waiting on it; the scoped dispatch at the night's commit is green: the triage names all three as ambiguous. It is red, and bisection finds the second merge red with its first parent green: the triage names the second merge.
- AE8. **Covers R12.** A mutation job's reproduce `corepack pnpm --filter x mutation`: refused. `gh workflow run Mutation --ref main -f sha=<sha> -f packages='["x"]'` with its predicted job-minutes: holds. A report job that merges parts with a local Deno command: holds.

### Scope Boundaries

- No workflow edit; #733 lands the nightly workflow and `.github/AGENTS.md:21`'s wording. The triage job, the lane's `sha` and `packages` inputs, its main-only guard and the two Stryker reproduce commands (`reusable-mutation.yml:158,282`) and the guard's branch-dispatch reproduce (`:73`), which also splices a pull request's branch name into a command are the shared-tooling unit's to change.
- `mutation-discipline` and `schema-laws` are untouched.
- The enrolment `ref` guidance is a separate pull request (Key Decisions).

### Sources / Research

- `a578c704a4:.github/workflows/mutation.yml` (dispatch only); `git log -- .github/workflows/mutation.yml` (`be67999aa6` push and pull request; `69347ba2da` push; `f9ebfc4f3a`, #700, dispatch only).
- #733 head `78826f9f59:.github/workflows/mutation.yml:1-17` (nightly cron, run-id group, measured cost).
- pnpm-release-management#57 (merged 2026-10-13, public): a short `ref` resolved to `roots=[]`.
- Eight Mutation `workflow_dispatch` runs on branches (31204982692 to 38115511598), read through the Actions API; GitHub, "Events that trigger workflows" (`workflow_dispatch`: `GITHUB_SHA` is the "Last commit on the `GITHUB_REF` branch or tag").
- stryker-js-effect #168 (`cec87480`) and `33c6175f:packages/stryker-js/README.md:189`.

### Assumptions challenged (destructive review, Inversion lens)

Round 3 (Edge-First lens): "a run title tells the triage which runs are its own" breaks while a re-test and a reproduce dispatch at one commit share the title `Mutation <sha>`; the `night` input puts the night's run id in a re-test's title. Round 6 (Edge-First again): a title is still a label any dispatcher can write, so the triage continues only on run ids its night's record holds. Round 7 (Edge-First): a task in a repository without issues, or a step summary, is nothing a later step can read, so the record is an Actions artifact named for the night.

Round 2 of the full-path review (Substitution lens on the triage's shape): "a scheduled triage can read the night and wait on its re-tests" breaks on both counts, since a cron can fire while the night still runs, and a job that waits on its re-tests, each up to a whole lane's 41-49 minutes of wall time, cannot bisect inside the 60-minute backstop. The triage is a `workflow_run` handler split into steps, as red-main splits its handler from its verdict.

1. "Bisection finds the culprit." Broken under flakiness (Flake-Aware Culprit Finding) and under several culprits (#733's four causes): the rule re-tests the night's commit first, requires green at the culprit's first parent, and calls anything else ambiguous; with several culprits it names the first, and the next night shows the rest.
2. "Refusing a branch dispatch costs nothing." A lane repair can no longer be run before it merges; its proof is the first dispatch on main after merge. Accepted: the eight branch runs were the cost of the other choice.
3. "Stryker steps are the jobs named mutation." The rule keys on what a step runs: the plan job runs `stryker plan`, and the report job, which only merges JSON, keeps its local command.

## Planning Contract

### Key Technical Decisions

- KTD1. **Pack text only.** Every change is in `compound-packs/ci-wall-clock/` plus this plan; nothing executes it, so no test is admitted (test-layer-selection).
- KTD2. **Citations resolve at public SHAs.** `78826f9f59` is #733's public branch head; `e08764fb8f`, `f9ebfc4f3a`, `a578c704a4`, `9154691d4b`, `0923912eed` and `4ae7e9e17c` are on main; `33c6175f` and `cec87480` are on stryker-js-effect's main.
- KTD3. **#761 does not overlap.** It edits `mutation-discipline/README.md:5`, `kill-survivors-with-contract-properties.md:42`, `unkillable-survivors-are-dead-code.md:45` and `ci-wall-clock/local-gate-equals-pr-gate.md:45`, none of which this pull request changes, and its merge raised no conflict. Those rules read a kill off "the next CI Mutation report, never from a local run" (`kill-survivors-with-contract-properties.md:44`, `unkillable-survivors-are-dead-code.md:45`), which the nightly lane, its main-only dispatch and the Stryker reproduce clause keep true.

## Implementation Units

### U1. The nightly rule and the pack's per-push text

- **Goal:** R1-R9.
- **Files:** `compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md` (new), `README.md`, `heavy-suites-judge-every-main-commit.md`, `heavy-lanes-state-their-daily-minutes.md`, `red-main-reverts-its-culprit-same-day.md`, `release-promotes-the-staging-proven-build.md`.
- **State:** landed in `3a6a66b22d`.

### U2. Main-only dispatch, the triage re-test, and Stryker reproduce commands

- **Goal:** R10-R12.
- **Files:** `compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md`, `failures-name-the-gate-and-location.md`, `README.md`.
- **Verification:** the new RIGHT exemplar passes actionlint with shellcheck, a broken copy fails, and its guard step, run under bash, refuses a branch ref and a commit main does not reach.

## Verification Contract

- Every new `<sha>:<path>:<line>` and `path:line` resolves to the quoted text.
- The CE pack resolver loads every declared pack with empty `errors` and `warnings`.
- `pnpm check:local` after the last edit (the `/dev/kvm` microVM suite runs in CI).
- A full-path `ce-code-review` receipt on the final head: every matched pack and constitution rule with its disposition and `file:line`, a blind DeepSeek or MiniMax peer, every finding dispositioned, overfit evidence per new rule; a privacy grep (every private repository name in the organisation, local paths, private run ids) over the diff, the commits and the PR body; ce-compound; CI green on the final head.

## Definition of Done

- U1, U2 and this plan landed in one pull request, CI green on its final head, the review receipt in its body.
