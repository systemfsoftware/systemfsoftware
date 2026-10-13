---
title: Mutation runs once a night on main, and a triage job turns a red night into a fix the owning agent receives
applies_when:
  - adding or changing a mutation workflow's triggers (`on:`), its `concurrency`, or its schedule
  - adding or changing a workflow or job that calls a mutation workflow (`uses:` of a reusable mutation workflow, or a dispatch of one)
  - adding or changing the triage job that reads the nightly mutation run, or where its result is sent
tags: [ci, workflows, mutation, nightly, schedule, triage, postsubmit]
---

A mutation lane on every push to main multiplies its cost by the merge rate and still leaves no one owning a red. This repo's Mutation lane ran on every push from 2026-09-25 to 2026-10-09 without one green run: 60 failed and 34 cancelled, 372 job-hours, and no job named a culprit. Its cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours"), and #700 (`f9ebfc4f3a`) stopped it by dropping the push trigger (`red-main-reverts-its-culprit-same-day`, `heavy-lanes-state-their-daily-minutes`). One whole-lane run took 87 jobs (1,050 job-min, at most 59 at once, run 38115511598) and 108 jobs (1,103 job-min, run 38109196324) from the organisation's concurrent-job limit, which its pull-request runs share (`78826f9f59:.github/workflows/mutation.yml:1-5`).

Per-push runs also fail to give each push its verdict. In the public stryker-js-effect on 2026-10-10, #283's Mutation run (38072120191) was cancelled while still pending, with no job started, when the next push queued (`heavy-suites-judge-every-main-commit`), so #283's push got no mutation verdict at all.

## Rule

A mutation lane runs once a night on main, on a `schedule` plus `workflow_dispatch`, and never on a push, a pull request or a merge queue. A triage job runs after the night's run, ties each new surviving mutant and each lane or gate failure to the merge that caused it, and sends the fix to the agent that owns the repository. A green night is one line; a red night never goes to the human operator.

- **Triggers:** one `schedule` entry a day and `workflow_dispatch`. No `push`, `pull_request` or `merge_group` trigger, and no workflow with one of those triggers calls the mutation workflow, directly, through `needs:` or through a reusable workflow. Never on a pull request is already law (`.github/AGENTS.md:21`); this rule adds never per push.
- **Concurrency:** each run takes a group of its own (`github.run_id`) with `cancel-in-progress: false`, so a dispatch never replaces the night's run, and the night's run never replaces a dispatch.
- **Scope:** a night's run covers every merge since the last green night. A run that selects work from a base compares against the last green night's commit after checking it is an ancestor, and runs everything when none is found (`pr-gate-runs-only-what-the-diff-affects`).
- **Triage:** a scheduled job that starts after the night's run is due to end, or a `workflow_run` handler on its completion, reads that run. For each surviving mutant the last green night did not have, it names the merge in the night's range (last green night..this night) that last changed the mutated line. For each lane or gate failure, it names the failing job's reason code, package and reproduce command (`failures-name-the-gate-and-location`) and the merges in the range that touched that package. When more than one merge fits, or none does, it names every candidate and says the attribution is ambiguous; it never picks one.
- **Routing:** a red night becomes one fix task for the agent that owns the repository, naming each culprit merge or the ambiguity, the survivors or failures, and the reproduce commands. That agent fixes or reverts through the pull-request gate. A red night never pages, mentions or assigns the human operator, and the triage job opens no revert itself.
- **Green:** a green night writes one line (the date, the commit range and "green") where the triage keeps its record, and nothing else.
- **Not a per-push lane:** a night covers several merges and runs on no push, so the per-push P0, merge freeze and automatic revert of `red-main-reverts-its-culprit-same-day` do not apply to it; the triage above is its red handling. Its daily price is one night's run plus each dispatch (`heavy-lanes-state-their-daily-minutes`).

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
```

No triage job exists in this organisation yet. The red half of this rule rests on the 94 red pushes above, which nobody owned for 14 days; the routing to the owning agent rather than the human operator is the house law of 2026-10-12.

Grounds: Google runs mutation on every change at code review, and Petrović, Ivanković, Fraser and Just, "Practical Mutation Testing at Scale: A view from Google", TSE 2021 (https://homes.cs.washington.edu/~rjust/publ/practical_mutation_testing_tse_2021.pdf), make that affordable with "diff-based mutation testing, which only generates and evaluates mutants for covered, changed lines". The lanes this pack governs mutate whole packages, so a run per change costs the whole lane, which is what the incidents above measured.

Gate: `review`. Does a mutation workflow in the diff have a `push`, `pull_request` or `merge_group` trigger, lack a daily `schedule` or `workflow_dispatch`, or share a concurrency group between runs? Can a push- or pull-request-triggered workflow in the diff call it? Does a triage job the diff adds or changes skip a survivor or failure, name one culprit where several merges fit, send a red night to the human operator, open a revert itself, or write more than one line for a green night?
