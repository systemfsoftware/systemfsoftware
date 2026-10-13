---
title: Mutation runs nightly on main - Plan
type: docs
date: 2026-10-13
topic: ci-wall-clock-nightly-mutation
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Mutation runs nightly on main - Plan

## Goal Capsule

- **Objective:** `ci-wall-clock` states the house law for mutation once: a mutation lane runs once a night on main (`schedule` plus `workflow_dispatch`), never per push and never on a pull request, and a triage job after the night ties each new survivor and each lane or gate failure to its culprit merge and sends the fix to the agent that owns the repository. A green night is one line; a red night never goes to the human operator.
- **Means:** a new rule `mutation-runs-nightly-on-main` (R1-R5), and the pack text that assumed a per-push mutation lane amended to match (R6-R9).
- **Product authority:** the root's intent of 2026-10-13 and the house law of 2026-10-12 (mutation nightly on main, schedule plus dispatch, never per push or per PR; a triage cron reads each night). The rule id, the file split, the wording and the evidence are derived here.
- **Stop conditions:** evidence that the nightly shape loses a verdict per-push mutation gave; a required edit to SL-owned `schema-laws` or `mutation-discipline` kill-survivors text.
- **Delivery:** one pull request off `main` at `a578c704a4`, docs and pack text only; no workflow edit. #733 (open, not this workstream's) lands the nightly workflow.
- **Open blockers:** none.

## Product Contract

### Summary

A new `ci-wall-clock` rule owns the mutation lane's cadence, concurrency, triage and routing. `heavy-suites-judge-every-main-commit` keeps per-push verdicts for full-stack e2e and full-corpus lanes and hands mutation to the new rule. The other rules whose text or exemplars showed mutation as a per-push lane stop doing so.

### Problem Frame

- **Per-push mutation multiplied a whole-lane cost by the merge rate, and nobody owned the red.** From 2026-09-25 to 2026-10-09 this repo's Mutation lane ran on every push to main without one green run: 60 failed, 34 cancelled, 372 job-hours (`compound-packs/ci-wall-clock/red-main-reverts-its-culprit-same-day.md:10`). #700 (`f9ebfc4f3a`) dropped the push trigger; main's `mutation.yml` has run on `workflow_dispatch` only since (`a578c704a4:.github/workflows/mutation.yml`). One whole-lane run took 87 and 108 jobs (runs 38115511598 and 38109196324, `78826f9f59:.github/workflows/mutation.yml:1-7`).
- **Per-push runs also lose verdicts.** In the public stryker-js-effect, 2026-10-10, #283's Mutation run 38072120191 was cancelled while pending, with no job started, when the next push queued (`heavy-suites-judge-every-main-commit.md:12`). A different repository and a different change from the first incident.
- **The pack still prescribes per push.** `heavy-suites-judge-every-main-commit` named mutation among the lanes that run on every push, with a per-push gritlint mutation exemplar; `heavy-lanes-state-their-daily-minutes`, `red-main-reverts-its-culprit-same-day` and `release-promotes-the-staging-proven-build` each showed a per-push Mutation lane in an exemplar. #733 lands the nightly workflow and would be graded against those rules.

### Key Decisions

- **A new rule, not an amendment.** The nightly lane's cadence, triage and routing are one subject that no existing rule covers; folding it into `heavy-suites-judge-every-main-commit` would contradict that rule's title and its per-push Concurrency and Scope bullets. Slug `mutation-runs-nightly-on-main`, id `ci-wall-clock/mutation-runs-nightly-on-main`.
- **Never on a pull request stays owned by `.github/AGENTS.md:21`.** The rule cites it and adds never per push.
- **Red-main's per-push machinery does not apply to a night.** A night covers several merges and has no push run, so the P0, freeze and automatic revert stay per-push; the triage is the night's red handling, and the owning agent decides between fix and revert.
- **Attribution never guesses.** A survivor is tied to the merge that last changed the mutated line in the night's range; a failure to the merges touching the failing package; when several fit or none does, the triage names every candidate and says so (SafeRevert's caution, already cited by `red-main-reverts-its-culprit-same-day`).
- **Other rules' per-push mutation exemplars are amended, not left.** They contradicted the new rule. Neutral exemplars rename their lane to `E2E`; `heavy-lanes-state-their-daily-minutes` cites #733's nightly cost header as its RIGHT and keeps its merge rate for per-push lanes only. E2e and full-corpus rule substance is unchanged.
- **The enrolment `ref` guidance is a separate pull request.** pnpm-release-management#57 shows a short `ref` gives `roots=[]` with a "source skipped" warning, and the fix is a full 40-character SHA. It concerns how any repository enrols any pack, not mutation cadence, and one incident is its only evidence; it rides a pull request of its own.

### Requirements

- R1. A new rule `compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md` in the pack's format: frontmatter `title`, `applies_when` (mutation workflow triggers and concurrency, callers of a mutation workflow, the triage job and where it sends a result), `tags`; why from two independent public incidents; `## Rule`; WRONG/RIGHT with `<repo> <sha>:<path>:<line>`; a closing `Gate: review` question answered from the diff.
- R2. Triggers: one daily `schedule` plus `workflow_dispatch`; no `push`, `pull_request` or `merge_group`; no push- or PR-triggered workflow calls it. Concurrency: a group per run, never cancelled.
- R3. Triage: after the night, each new survivor and each lane or gate failure is tied to its culprit merge in the night's range, or to every candidate with the ambiguity stated.
- R4. Routing: a red night is one fix task for the agent that owns the repository; never the human operator; the triage opens no revert. A green night is one line.
- R5. The rule says what is unproven: no triage job exists in the organisation yet.
- R6. README line 3 and the rule list name the nightly lane and the new rule.
- R7. `heavy-suites-judge-every-main-commit` keeps per-push verdicts for full-stack e2e and full-corpus lanes, hands mutation to the new rule, keeps mutation in its Reach list of main-only suites, and drops its per-push mutation exemplar and cost arithmetic.
- R8. `heavy-lanes-state-their-daily-minutes` prices a nightly lane by its night, with no merge rate; its RIGHT is #733's nightly cost header.
- R9. `red-main-reverts-its-culprit-same-day` scopes itself to per-push verdicts and points a nightly lane's red to the new rule; its neutral exemplar's lane, and the release rule's neutral trigger list, become `E2E`.

### Acceptance Examples

- AE1. **Covers R2.** A diff adds `push: branches: [main]` to `mutation.yml`: refused. A diff adds `schedule` with one daily cron and keeps `workflow_dispatch`: holds.
- AE2. **Covers R2.** A diff makes `ci.yml` (on `pull_request`) call `reusable-mutation.yml`: refused.
- AE3. **Covers R3.** Two merges in the night's range touched the failing package: the triage names both and says the attribution is ambiguous.
- AE4. **Covers R4.** A triage job that mentions the human operator on a red night, or opens a revert itself: refused.
- AE5. **Covers R7.** A full-stack e2e lane in the diff drops its push trigger for a schedule: `heavy-suites-judge-every-main-commit` refuses it, unchanged.

### Scope Boundaries

- No workflow edit; #733 lands the nightly workflow and `.github/AGENTS.md:21`'s wording. The triage job is the root's to build.
- `mutation-discipline` and `schema-laws` are untouched.
- The enrolment `ref` guidance is a separate pull request (Key Decisions).

### Sources / Research

- `a578c704a4:.github/workflows/mutation.yml` (dispatch only); `git log -- .github/workflows/mutation.yml` (`be67999aa6` push and pull request; `69347ba2da` push; `f9ebfc4f3a`, #700, dispatch only).
- #733 head `78826f9f59:.github/workflows/mutation.yml:1-17` (nightly cron, run-id group, measured cost).
- pnpm-release-management#57 (merged 2026-10-13, public): a short `ref` resolved to `roots=[]`.

## Planning Contract

### Key Technical Decisions

- KTD1. **Pack text only.** Every change is in `compound-packs/ci-wall-clock/` plus this plan; nothing executes it, so no test is admitted (test-layer-selection).
- KTD2. **Citations resolve at public SHAs.** `78826f9f59` is #733's public branch head; `e08764fb8f`, `f9ebfc4f3a` and `a578c704a4` are on main.

## Implementation Units

### U1. The nightly rule and the pack's per-push text

- **Goal:** R1-R9.
- **Files:** `compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md` (new), `README.md`, `heavy-suites-judge-every-main-commit.md`, `heavy-lanes-state-their-daily-minutes.md`, `red-main-reverts-its-culprit-same-day.md`, `release-promotes-the-staging-proven-build.md`.

## Verification Contract

- Every new `<sha>:<path>:<line>` and `path:line` resolves to the quoted text.
- The CE pack resolver loads every declared pack with empty `errors` and `warnings`.
- `pnpm check:local` after the last edit (the `/dev/kvm` microVM suite runs in CI).
- A full-path `ce-code-review` receipt on the final head: every matched pack and constitution rule with its disposition and `file:line`, a blind DeepSeek or MiniMax peer, every finding dispositioned, overfit evidence per new rule; a privacy grep (every private repository name in the organisation, local paths, private run ids) over the diff, the commits and the PR body; ce-compound; CI green on the final head.

## Definition of Done

- U1 and this plan landed in one pull request, CI green on its final head, the review receipt in its body.
