---
title: Mutation runs once a night on main, and a triage job turns a red night into a fix the owning agent receives
applies_when:
  - adding or changing a mutation workflow's triggers (`on:`), its `concurrency`, or its schedule
  - adding or changing a workflow or job that calls a mutation workflow (`uses:` of a reusable mutation workflow, or a dispatch of one)
  - adding or changing a mutation workflow's `workflow_dispatch` inputs, or the job that refuses a run before anything installs
  - adding or changing the triage job that reads the nightly mutation run, or where its result is sent
  - changing a mutation lane's scope, shard sizing, `matrix` or job list
tags: [ci, workflows, mutation, nightly, schedule, triage, postsubmit]
---

A mutation lane on every push to main multiplies its cost by the merge rate and still leaves no one owning a red. This repo's Mutation lane ran on every push from 2026-09-25 to 2026-10-09 without one green run: 60 failed and 34 cancelled, 372 job-hours, and no job named a culprit. Its cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours"), and #700 (`f9ebfc4f3a`) stopped it by dropping the push trigger (`red-main-reverts-its-culprit-same-day`, `heavy-lanes-state-their-daily-minutes`). Before #747 narrowed what a run mutates to workflow files, one whole-lane run took 87 jobs (1,050 job-min, at most 59 at once, run 38115511598) and 108 jobs (1,103 job-min, run 38109196324) (`78826f9f59:.github/workflows/mutation.yml:4-5`) out of the organisation's concurrent-job limit, which every workflow in its repositories shares, pull-request runs included: GitHub caps each plan's "Total concurrent jobs" on its hosted runners (https://docs.github.com/en/actions/reference/limits).

Per-push runs also fail to give each push its verdict. In the public stryker-js-effect on 2026-10-10, #283's Mutation run (38072120191) was cancelled while still pending, with no job started, when the next push queued (`heavy-suites-judge-every-main-commit`), so #283's push got no mutation verdict at all.

A dispatch can also judge a branch instead of main. GitHub runs a `workflow_dispatch` on "the last commit on the `GITHUB_REF` branch or tag", and once a workflow has run, "you can dispatch it against any branch or tag" (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). This repo's Mutation lane ran eight dispatches on branches: 31204982692 on `ci/merged-mutation-report` (2026-08-07), 38028129586 on `fix/mutation-causes`, and six on `fix/mutation-lane` from 38089035845 to 38115511598 (2026-10-10 and 2026-10-11), the last two being the 1,050 and 1,103 job-min runs above. They predate the house law of 2026-10-12, and nothing would refuse them now. The lane's guard fails only pull-request and merge-queue events (`0923912eed:.github/actions/mutation-event-guard/action.yml:13-19`), and Stryker's own refusal reads only whether it runs in CI: `stryker run` "refuses to start unless `GITHUB_ACTIONS` is `true`" (`systemfsoftware/stryker-js-effect 33c6175f:packages/stryker-js/README.md:189`), so it cannot tell a branch from main.

## Rule

A mutation lane runs once a night on main, on a `schedule` plus `workflow_dispatch`, and never on a push, a pull request, a merge queue or a branch. A triage job runs after the night's run, ties each new surviving mutant and each lane or gate failure to the merge that caused it, re-testing on main when several merges fit, and sends the fix to the agent that owns the repository. A green night is one line; a red night never goes to the human operator.

- **Triggers:** one `schedule` entry a day and `workflow_dispatch`. A lane with a `schedule` and no triage writes the night's record itself, green or red, and ends a red night with the Routing clause's fix task, through its channels with its own run in the triage run's place, naming every merge in the night's range as a candidate, so no night is red with nobody told and the next night still finds its start. No `push`, `pull_request` or `merge_group` trigger, and no workflow that a push, pull request or merge queue starts calls or dispatches the mutation workflow, directly, through `needs:`, through a reusable workflow or through a `workflow_run` chain. Never on a pull request is already law (`.github/AGENTS.md:21`); this rule adds never per push.
- **Main only:** a dispatch runs on main. The lane's first job fails a run whose ref is not the default branch, before anything installs, and every other job of the lane `needs:` it, and a commit other than main's tip is tested only through the `sha` input, which that job checks against the default branch's tip, fetched by a `fetch-depth: 0` checkout (`git merge-base --is-ancestor -- "$SHA" "origin/$DEFAULT"`, whose `--` refuses an option-shaped `sha`; the default branch read from `github.ref_name` on a `schedule` event, which carries no repository payload), never against its own checkout and never through `--ref <branch>`.
- **Dispatch inputs:** the lane accepts `sha`, `packages` (a JSON array of package names) and `night` as `workflow_dispatch` inputs. It checks out `inputs.sha` when set, plans every package when `packages` is unset and only the packages it names when set, fails its plan when a set `packages` is not a non-empty JSON array of known package names, and titles every run with the commit it tests and, for a triage's re-test, the night's run id that `night` carries (`run-name: Mutation ${{ inputs.sha || github.sha }}${{ inputs.night && format(' for {0}', inputs.night) || '' }}`). This is the dispatch contract `red-main-reverts-its-culprit-same-day` gives its lane L, with packages in place of job names, because a mutation lane's jobs come from its plan and are packed differently at another commit.
- **Concurrency:** each run takes a group of its own (`github.run_id`) with `cancel-in-progress: false`, so a dispatch never replaces the night's run, and the night's run never replaces a dispatch.
- **Scope:** a night's run covers every merge since the last green night: the newest `schedule` run of the lane on main whose night's record says green (the run ended `success`, its report is complete for every package it planned, and its triage, where one exists, found nothing new), read from the Actions API. A night's run mutates every package or selects work from a base; one that selects compares against the last green night's commit after checking it is an ancestor, and runs everything when none is found or when a merge in the range changed the lane's own inputs (its workflow, its config, its tool pin) (`pr-gate-runs-only-what-the-diff-affects`). Its jobs are sized by measured timings, never by a fixed count (`heavy-suites-judge-every-main-commit`'s Sharding bullet).
- **Triage:** a `workflow_run` handler on the completion of the lane's runs on main, whose runs share one concurrency group with `queue: max` and `cancel-in-progress: false`, so no two steps write the night's record at once and none is replaced while fewer than GitHub's 100 runs wait. A run whose event is `schedule` starts a night's triage, so it never reads a run still running; its first step writes the night's record, an Actions artifact named for the night's run id holding the range, the survivors or failures, the attribution (pending until named) and the run id of every re-test the triage dispatches (found right after the dispatch with red-main's bounded retry, the night's attribution ambiguous when it runs out, and continued from at once by the step that records it when that run has already completed, as `red-main-reverts-its-culprit-same-day`'s handler finds its run: exact title, `workflow_dispatch` event, `main`, created after the dispatch), which each step uploads again with what it added, so the newest copy is the record, and files the fix task with attribution pending where the repository has issues, which each later step updates, else ends its own run red with that pending task in its step summary; the completion of a run whose id the night's record holds continues it (the record is found by the night its title names, and only the recorded id proves the run is the triage's), and a title is a label, never proof that the triage started a run; any other run, a manual dispatch or a reproduce included, starts nothing. The triage also accepts a night's run id as a `workflow_dispatch` input, to triage that night again. For each surviving mutant the last green night did not have, it finds the merges in the night's range (last green night..this night) that changed the mutated line. A night's run that ends with no verdict (`cancelled`, a startup failure) is a red night with that conclusion as its failure. For each lane or gate failure, it names the failing job's reason code, packages and reproduce command (`failures-name-the-gate-and-location`) and finds the merges in the range that touched those packages. One merge found is the culprit. When several are found, it re-tests before naming one. Every re-test runs its mutants at that commit and never restores the lane's incremental record, so its verdict is never one a run remembered (`.github/AGENTS.md:21`). A dispatch at the night's commit, scoped to those packages, must show the survivor or failure again; a scoped dispatch at the first candidate's first parent must not show it; the triage then bisects the candidates in merge order with scoped dispatches on main. A re-test whose plan selects no mutant for its packages shows nothing either way. The culprit is the first candidate whose run shows it while the run at its first parent does not. Before each dispatch it states the job-minutes the plan predicts for those packages. No triage job waits on a re-test: it starts the dispatch and ends, and the dispatched run's completion starts the next step, which finds that record and re-derives the candidates left from it, the way `red-main-reverts-its-culprit-same-day` splits its handler from its verdict. When the night's commit does not show it again, the first candidate's first parent shows it too, a re-test plans no mutant, a re-test does not complete before the next night's triage starts, or no merge is found, the triage names every candidate and says the attribution is ambiguous; it never picks one any other way.
- **Routing:** a red night becomes one fix task for the agent that owns the repository (the coding agent the operator has given the repository to); a night that shows a survivor or failure an open task already names updates that task and never files another, and a night that no longer shows it says so on that task. The task mentions the account that opened each culprit merge's pull request, every candidate's when the attribution is ambiguous, as the P0 of `red-main-reverts-its-culprit-same-day` mentions its commit's author, naming each culprit merge or the ambiguity, the survivors or failures, and the reproduce commands. The task is an issue where the repository has issues, else a comment on each culprit merge's pull request, else the triage run's step summary with its job red, the order `red-main-reverts-its-culprit-same-day` uses for its P0. A triage that cannot read the night's run or the night's record, or ends red on its own failure, is routed the same way, naming the run id to triage again, and marks the night's record red with that run id, so the next night's triage files the task again; a step summary is the human-readable copy, never the only delivery. That agent fixes or reverts through the pull-request gate. A red night never pages, mentions or assigns the human operator, and the triage job opens no revert itself.
- **Green:** a green night writes one line (the night's run id, the commit range and "green") in the step summary of the run that writes the night's record (the triage's, or the lane's own where no triage exists) and a night's record that says green, and nothing else; the next night reads its start from that record.
- **Not a per-push lane:** a night covers several merges and runs on no push, so the per-push P0, merge freeze and automatic revert of `red-main-reverts-its-culprit-same-day` do not apply to it; the triage above is its red handling. A release does not wait for a night either: `release-promotes-the-staging-proven-build` reads the lanes that run on a push, and a survivor found after a commit was promoted goes to the triage like any other. Its daily price is one night's run plus each dispatch (`heavy-lanes-state-their-daily-minutes`).

```yaml
# WRONG: systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:3-12
# On every push and every pull request, one group per ref: 94 pushes ran without a green
# run, and each push's run cancelled the one before it.
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: mutation-${{ github.ref }}
  cancel-in-progress: true

# RIGHT: systemfsoftware/systemfsoftware 78826f9f59:.github/workflows/mutation.yml:10-17
# One scheduled run a night and dispatch; each run keeps a group of its own.
on:
  schedule:
    - cron: "17 14 * * *"
  workflow_dispatch:

concurrency:
  group: mutation-${{ github.run_id }}
  cancel-in-progress: false

# RIGHT: neutral shape, no citation. The triage, on the completion of each Mutation run on main:
# a `schedule` run starts a night's triage, the completion of a re-test whose id that night's
# record holds continues it, and any other run starts nothing. A dispatch names a night's run to triage again.
on:
  workflow_run:
    workflows: [Mutation]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      run:
        description: The id of a night's Mutation run to triage again.
        type: string
        required: true

# Runs must not overlap: each step rewrites the night's record. `queue: max` is GitHub's
# (workflow syntax, `concurrency.queue`), newer than actionlint 1.7.12.
concurrency:
  group: mutation-triage
  queue: max
  cancel-in-progress: false

# RIGHT: neutral shape, no citation. The lane's dispatch inputs, and a step of its first job,
# which runs after a `fetch-depth: 0` checkout and fails before anything installs; the commit
# is checked against the default branch's fetched tip, whatever the job checked out.
run-name: Mutation ${{ inputs.sha || github.sha }}${{ inputs.night && format(' for {0}', inputs.night) || '' }}
on:
  schedule:
    - cron: "17 14 * * *"
  workflow_dispatch:
    inputs:
      sha:
        description: A commit main reaches. Empty means main's tip.
        type: string
        required: false
      packages:
        description: JSON array of package names to plan. Empty means every package.
        type: string
        required: false
      night:
        description: The night's run id a triage re-test is for. Empty for any other dispatch.
        type: string
        required: false
---
- id: main-only
  env:
    # A `schedule` event has no repository payload and runs only on the default branch.
    DEFAULT: ${{ github.event.repository.default_branch || github.ref_name }}
    SHA: ${{ inputs.sha }}
  run: |
    [ "$GITHUB_REF" = "refs/heads/$DEFAULT" ] \
      || { echo "::error title=mutation-off-main::$GITHUB_REF is not $DEFAULT"; exit 1; }
    [ -z "$SHA" ] || git merge-base --is-ancestor -- "$SHA" "origin/$DEFAULT" \
      || { echo "::error title=mutation-off-main::$SHA is not a commit $DEFAULT reaches"; exit 1; }
```

No triage job exists in this organisation yet, so the Triage and Routing clauses judge a diff only once one adds or changes it. The red half of this rule rests on the 94 red pushes above, which nobody owned for 14 days; the routing to the owning agent rather than the human operator is the house law of 2026-10-12. A night's range normally holds several merges: main took 76 first-parent commits in the week to 2026-10-13, 10.9 a day (`0923912eed:.github/workflows/mutation.yml:7-8`), and #733 found four separate causes behind this lane's one red window ("repair main's mutation lane at its four causes"). So when several merges fit, the triage re-tests before it names a culprit, with the same two runs `red-main-reverts-its-culprit-same-day` requires before a revert: red at the commit, green at its first parent.

Grounds: Google runs mutation on every change at code review, and Petrović, Ivanković, Fraser and Just, "Practical Mutation Testing at Scale: A view from Google", TSE 2021 (https://homes.cs.washington.edu/~rjust/publ/practical_mutation_testing_tse_2021.pdf), make that affordable with "diff-based mutation testing, which only generates and evaluates mutants for covered, changed lines". The lanes this pack governs mutate whole packages, so a run per change costs the whole lane, which is what the incidents above measured. For the re-test, Dorward, Johnston, Nickell and Henderson, "Flake-Aware Culprit Finding" (https://research.google/pubs/flake-aware-culprit-finding-2/): "A naive binary search (or bisect) algorithm will be unreliable if the test being used for the bisection is flaky", which is why a bisection here starts only after the night's commit shows the result again, and ends in a culprit only where its first parent's run is green.

Gate: `review`. Does a mutation workflow in the diff have a `push`, `pull_request` or `merge_group` trigger, lack a daily `schedule` or `workflow_dispatch`, or share a concurrency group between runs? Can a workflow in the diff that a push, a pull request or a merge queue starts call or dispatch it, directly, through `needs:`, through a reusable workflow or through a `workflow_run` chain? Does a night's run scope itself from anything but the last green night's commit, skip the run-everything fallback when none is found or the lane's own inputs changed, or size its jobs by anything but measured timings? Can its dispatch run on a ref other than the default branch or test a commit main does not reach, or can a job run before the refusing job passes, or does it lack the `sha`, `packages` and `night` inputs, a run title naming the commit it tests and the night a re-test is for, or a plan that fails on a set `packages` value other than a non-empty array of known names? Can a mutation lane in the diff carry a `schedule` with no triage and no fix task of its own for a red night? Does it count a night green on its conclusion alone, without a complete report and a triage that found nothing new? Does a triage the diff adds or changes name in `workflow_run.workflows` anything but the lane's `name:`, or a branch other than `main`, or start on anything but a night's `schedule` run or a dispatch naming a night's run id, or continue on a run whose id the night's record does not hold, keep that record where a later step cannot read it, read a night's run before it completes, wait inside a job on a re-test, leave a triage that failed unrouted, skip a survivor or failure, run its steps outside one queued concurrency group, name one culprit where several merges fit without the scoped re-tests at the night's commit, the first candidate's first parent, the candidate and its first parent, count a re-test that planned no mutant or restored the lane's incremental record, start a re-test without stating its predicted job-minutes, send a red night to the human operator or to no named place, file a second task for a survivor or failure an open task names, open a revert itself, or write more than one line for a green night?
