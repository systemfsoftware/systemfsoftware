---
title: Mutation runs once a night on main, and a triage job turns a red night into a fix the owning agent receives
applies_when:
  - adding or changing a mutation workflow's triggers (`on:`), its `concurrency`, or its schedule
  - adding or changing a workflow or job that calls a mutation workflow (`uses:` of a reusable mutation workflow, or a dispatch of one)
  - adding or changing a mutation workflow's `workflow_dispatch` inputs, or the job that refuses a run before anything installs
  - adding or changing the triage job that reads the nightly mutation run, or where its result is sent
tags: [ci, workflows, mutation, nightly, schedule, triage, postsubmit]
---

A mutation lane on every push to main multiplies its cost by the merge rate and still leaves no one owning a red. This repo's Mutation lane ran on every push from 2026-09-25 to 2026-10-09 without one green run: 60 failed and 34 cancelled, 372 job-hours, and no job named a culprit. Its cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours"), and #700 (`f9ebfc4f3a`) stopped it by dropping the push trigger (`red-main-reverts-its-culprit-same-day`, `heavy-lanes-state-their-daily-minutes`). One whole-lane run took 87 jobs (1,050 job-min, at most 59 at once, run 38115511598) and 108 jobs (1,103 job-min, run 38109196324) (`78826f9f59:.github/workflows/mutation.yml:4-5`) out of the organisation's concurrent-job limit, which every workflow in its repositories shares, pull-request runs included: GitHub caps each plan's "Total concurrent jobs" on its hosted runners (https://docs.github.com/en/actions/reference/limits).

Per-push runs also fail to give each push its verdict. In the public stryker-js-effect on 2026-10-10, #283's Mutation run (38072120191) was cancelled while still pending, with no job started, when the next push queued (`heavy-suites-judge-every-main-commit`), so #283's push got no mutation verdict at all.

A dispatch can also judge a branch instead of main. GitHub runs a `workflow_dispatch` on "the last commit on the `GITHUB_REF` branch or tag", and once a workflow has run, "you can dispatch it against any branch or tag" (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). This repo's Mutation lane ran eight dispatches on branches: 31204982692 on `ci/merged-mutation-report` (2026-08-07), 38028129586 on `fix/mutation-causes`, and six on `fix/mutation-lane` from 38089035845 to 38115511598 (2026-10-10 and 2026-10-11), the last two being the 1,050 and 1,103 job-min runs above. They predate the house law of 2026-10-12, and nothing would refuse them now. The lane's guard fails only pull-request and merge-queue events (`0923912eed:.github/actions/mutation-event-guard/action.yml:13-19`), and Stryker's own refusal reads only whether it runs in CI: `stryker run` "refuses to start unless `GITHUB_ACTIONS` is `true`" (`systemfsoftware/stryker-js-effect 33c6175f:packages/stryker-js/README.md:189`), so it cannot tell a branch from main.

## Rule

A mutation lane runs once a night on main, on a `schedule` plus `workflow_dispatch`, and never on a push, a pull request, a merge queue or a branch. A triage job runs after the night's run, ties each new surviving mutant and each lane or gate failure to the merge that caused it, re-testing on main when several merges fit, and sends the fix to the agent that owns the repository. A green night is one line; a red night never goes to the human operator.

- **Triggers:** one `schedule` entry a day and `workflow_dispatch`. No `push`, `pull_request` or `merge_group` trigger, and no workflow with one of those triggers calls or dispatches the mutation workflow, directly, through `needs:` or through a reusable workflow. Never on a pull request is already law (`.github/AGENTS.md:21`); this rule adds never per push.
- **Main only:** a dispatch runs on main. The lane's first job fails a run whose ref is not the default branch, before anything installs, and a commit other than main's tip is tested only through the `sha` input, which that job checks against the default branch's fetched tip (`git merge-base --is-ancestor "$SHA" "origin/$DEFAULT"`), never against its own checkout and never through `--ref <branch>`.
- **Dispatch inputs:** the lane accepts `sha` and `packages` as `workflow_dispatch` inputs. It checks out `inputs.sha` when set, plans only the packages `packages` names when set, fails its plan when a name matches no package, and titles every run with the commit it tests (`run-name: Mutation ${{ inputs.sha || github.sha }}`). This is the dispatch contract `red-main-reverts-its-culprit-same-day` gives its lane L, with packages in place of job names, because a mutation lane's jobs come from its plan and are packed differently at another commit.
- **Concurrency:** each run takes a group of its own (`github.run_id`) with `cancel-in-progress: false`, so a dispatch never replaces the night's run, and the night's run never replaces a dispatch.
- **Scope:** a night's run covers every merge since the last green night. A run that selects work from a base compares against the last green night's commit after checking it is an ancestor, and runs everything when none is found (`pr-gate-runs-only-what-the-diff-affects`).
- **Triage:** a scheduled job that starts after the night's run is due to end, or a `workflow_run` handler on its completion, reads that run, and only that run: the night is the lane's run whose event is `schedule`, so a dispatch, the triage's own re-tests included, never starts a triage. It acts only on a completed run; a night's run still running, or one it cannot read, ends the triage job red with the run's id, never a green line. For each surviving mutant the last green night did not have, it finds the merges in the night's range (last green night..this night) that changed the mutated line. For each lane or gate failure, it names the failing job's reason code, packages and reproduce command (`failures-name-the-gate-and-location`) and finds the merges in the range that touched those packages. One merge found is the culprit. When several are found, it re-tests before naming one. A dispatch at the night's commit, scoped to those packages, must show the survivor or failure again; the triage then bisects the candidates in merge order with scoped dispatches on main, taking the last green night's commit as green. The culprit is the first candidate whose run shows it while the run at its first parent does not. Before each dispatch it states the job-minutes the plan predicts for those packages. When the night's commit does not show it again, a re-test does not complete, or no merge is found, the triage names every candidate and says the attribution is ambiguous; it never picks one any other way.
- **Routing:** a red night becomes one fix task for the agent that owns the repository, naming each culprit merge or the ambiguity, the survivors or failures, and the reproduce commands. The task is an issue where the repository has issues, else a comment on each culprit merge's pull request, else the triage run's step summary with its job red, the order `red-main-reverts-its-culprit-same-day` uses for its P0. That agent fixes or reverts through the pull-request gate. A red night never pages, mentions or assigns the human operator, and the triage job opens no revert itself.
- **Green:** a green night writes one line (the date, the commit range and "green") in the triage run's step summary, and nothing else.
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

# RIGHT: neutral shape, no citation. The triage job, after the night's run is due to end.
# It reads that run, names a culprit merge for each new survivor and each failure, and sends
# one fix task to the agent that owns the repository; a green night is one line.
on:
  schedule:
    - cron: "17 16 * * *"

# RIGHT: neutral shape, no citation. The lane's dispatch inputs, and a step of its first job,
# which runs after a `fetch-depth: 0` checkout and fails before anything installs; the commit
# is checked against the default branch's fetched tip, whatever the job checked out.
run-name: Mutation ${{ inputs.sha || github.sha }}
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
---
- id: main-only
  env:
    DEFAULT: ${{ github.event.repository.default_branch }}
    SHA: ${{ inputs.sha }}
  run: |
    [ "$GITHUB_REF" = "refs/heads/$DEFAULT" ] \
      || { echo "::error title=mutation-off-main::$GITHUB_REF is not $DEFAULT"; exit 1; }
    [ -z "$SHA" ] || git merge-base --is-ancestor "$SHA" "origin/$DEFAULT" \
      || { echo "::error title=mutation-off-main::$SHA is not a commit $DEFAULT reaches"; exit 1; }
```

No triage job exists in this organisation yet. The red half of this rule rests on the 94 red pushes above, which nobody owned for 14 days; the routing to the owning agent rather than the human operator is the house law of 2026-10-12. A night's range normally holds several merges: main took 76 first-parent commits in the week to 2026-10-13, 10.9 a day (`0923912eed:.github/workflows/mutation.yml:7-8`), and #733 found four separate causes behind this lane's one red window ("repair main's mutation lane at its four causes"). So the triage re-tests before it names a culprit, with the same two runs `red-main-reverts-its-culprit-same-day` requires before a revert: red at the commit, green at its first parent.

Grounds: Google runs mutation on every change at code review, and Petrović, Ivanković, Fraser and Just, "Practical Mutation Testing at Scale: A view from Google", TSE 2021 (https://homes.cs.washington.edu/~rjust/publ/practical_mutation_testing_tse_2021.pdf), make that affordable with "diff-based mutation testing, which only generates and evaluates mutants for covered, changed lines". The lanes this pack governs mutate whole packages, so a run per change costs the whole lane, which is what the incidents above measured. For the re-test, Dorward, Johnston, Nickell and Henderson, "Flake-Aware Culprit Finding" (https://research.google/pubs/flake-aware-culprit-finding-2/): "A naive binary search (or bisect) algorithm will be unreliable if the test being used for the bisection is flaky", which is why a bisection here starts only after the night's commit shows the result again, and ends in a culprit only where its first parent's run is green.

Gate: `review`. Does a mutation workflow in the diff have a `push`, `pull_request` or `merge_group` trigger, lack a daily `schedule` or `workflow_dispatch`, or share a concurrency group between runs? Can a push- or pull-request-triggered workflow in the diff call it? Can its dispatch run on a ref other than the default branch or test a commit main does not reach, or does it lack the `sha` and `packages` inputs? Does a triage job the diff adds or changes start on a dispatch, act on a night's run that has not completed, skip a survivor or failure, name one culprit where several merges fit without the scoped re-tests at the night's commit, the candidate and its first parent, start a re-test without stating its predicted job-minutes, send a red night to the human operator or to no named place, open a revert itself, or write more than one line for a green night?
