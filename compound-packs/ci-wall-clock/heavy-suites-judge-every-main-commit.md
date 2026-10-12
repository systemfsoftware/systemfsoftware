---
title: Heavy suites judge every push to main, scoped from the lane's last green commit, and no push cancels another's run
applies_when:
  - adding or changing a full-stack e2e, full-corpus or mutation lane
  - changing a heavy lane's triggers, scope or shard sizing
  - adding or changing the `concurrency` group or `cancel-in-progress` of a workflow or job that runs on pushes to main
  - adding a schedule to a heavy lane
  - adding or changing a full VM test or a machine-image build in a workflow, or a `pull_request` trigger to one that has them
tags: [ci, workflows, postsubmit, concurrency, scope, mutation, e2e, machine-image]
---

A push to main whose heavy run is cancelled has no verdict, so a break it introduced is found later, on someone else's commit. In the public stryker-js-effect on 2026-10-10, #276 and #283 merged 4 seconds apart. #283's push cancelled #276's Nix run (38072116236) 6 seconds after it was created. #283's Mutation run (38072120191) waited behind #276's and was cancelled while still pending, with no job started, the second the next push queued (38073188099): main's concurrency kept `cancel-in-progress: false` but set no `queue`, and GitHub replaces a pending run when a newer one queues. In this repo, the Mutation lane at `e08764fb8f` also ran on pull requests, and its one group per ref with `cancel-in-progress: true` let each push to main cancel the previous push's run in progress.

A coding agent that wires main-only work into presubmit makes every pull request wait on it. An unnamed private repo, 2026-10-12: a full NixOS VM test, 25-40 minutes on hosted runners, ran on every pull request, and three machine-image builds of 27 minutes or more ran on every pull request that touched Nix paths. Each pull request paid that runner time before its verdict, for work that judges main, not the diff.

With coding agents working in parallel sandboxes, each sandbox runs its own fast inner loop against its own branch, and none of them sees the others' changes together. Main is where those branches first meet, so the per-push heavy verdict is the outer loop that judges them combined. The stryker-js-effect pair above is that case: #283 renamed a field #276 read, so the break existed only once both were on main, and the cancellation removed the run that would have judged #276 alone. An agent that cancels, skips or batches main's runs to save minutes removes the one place two agents' changes are tested together, and when they break each other, no run names which push did it.

## Rule

Full-stack e2e, full-corpus and mutation lanes run postsubmit on every push to main: each push gets its own completed run, and a commit is judged by the run that covers it. They never run in or block a pull request, nor does a full VM test or a machine-image build, and no later push cancels or replaces an earlier push's run.

- **Concurrency:** on main, a group keyed by the commit (`github.sha` on a push), with `cancel-in-progress: false`, so no main run ever shares a group with a newer push. Pull-request refs keep `cancel-in-progress: true`. A fixed main-side group with `queue: max` and `cancel-in-progress: false` is accepted only for a lane whose runs must not overlap, with a comment saying why: GitHub keeps at most 100 runs pending in it, and "When the queue is full, any additional jobs or workflow runs are canceled", so it is not acceptable when the lane's runs could overlap safely, or when its pushes per day times its run time could fill that queue. A fixed group without `queue: max` is never acceptable.
- **Scope:** a push run tests the diff from the lane's last green main commit to this commit, after checking that commit is an ancestor of this one. The full corpus runs only on `workflow_dispatch`, when the lane's own inputs change (its workflow file, its config, its tool pin), and as the fallback when no green ancestor is found, so a run never under-tests. No scheduled full corpus.
- **Sharding:** shard sizes come from measured timings so each job takes about 10 minutes or less. That target is reported in the step summary and is never a timeout; the 60-minute backstop is the only wall-clock kill (`one-stuck-job-backstop`).
- **Reach:** no job reachable from a `pull_request` trigger (directly, through `needs:`, or through a reusable workflow it calls) runs a main-only suite (full-stack e2e, full corpus, mutation), a full VM test (one that boots a whole operating-system image to exercise the system, such as a NixOS VM test), or a machine-image build (a runner, VM or OS image). They run on push to main or on dispatch.

A worked example, in the public gritlint: its full mutation run 38114454518 cost 234 job-min in 55 jobs (53 shards and 2 control jobs), its longest shard 7m08s; its in-diff run 38112987198 cost 10 job-min in 4 jobs, its longest 4m29s.

```yaml
# WRONG: systemfsoftware/stryker-js-effect 815754693e:.github/workflows/mutation.yml:26-28
# No `queue`, so a pending main run is replaced when the next push queues: run 38072120191
# for #283 was cancelled with no job started.
concurrency:
  group: ${{ github.event.head_commit.author.username == 'github-actions[bot]' && format('mutation-release-{0}', github.run_id) || format('mutation-{0}', github.ref) }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

# WRONG: systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:3-12
# Runs on pull requests, and one group per ref cancels main's runs in progress.
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: mutation-${{ github.ref }}
  cancel-in-progress: true

# RIGHT: systemfsoftware/gritlint 5c9c2ab:.github/workflows/mutants.yml:3-20
# Push to main only, a group per commit on push, never cancelled; an in-diff mode scoped
# from the last green main run.
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      mode:
        description: "full: every mutant. in-diff: the mutants in the diff from base, or from the last green main run."
        type: choice
        options: [full, in-diff]
        default: full
      base:
        description: "in-diff only: the commit to diff from. Empty means the last green main run."
        type: string
        required: false

concurrency:
  group: mutants-${{ github.event_name == 'push' && github.sha || github.ref }}
  cancel-in-progress: false

# WRONG: neutral shape of an unnamed pattern (2026-10-12). A full VM test and three image
# builds on pull requests that touch Nix paths (that repo ran the VM test on every one).
on:
  pull_request:
    paths: ["nix/**", "flake.lock"]
  push:
    branches: [main]
jobs:
  vm-test:
    steps:
      - run: nix build .#checks.x86_64-linux.vm-test
  image:
    strategy:
      matrix:
        image: [runner, builder, cache]
    steps:
      - run: nix build ".#images.${{ matrix.image }}"

# RIGHT: neutral shape, no citation. The same VM test and image builds, reachable only from a
# push to main or a dispatch; the pull request keeps its affected-only gate.
on:
  push:
    branches: [main]
  workflow_dispatch:

# RIGHT: neutral shape, no citation. One group per main commit, never cancelled; a dispatch
# gets a group of its own; a pull-request ref, in a workflow that has one, cancels its
# superseded run.
concurrency:
  group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.event_name == 'push' && github.sha || github.run_id }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Grounds: GitHub, "Control the concurrency of workflows and jobs" (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency): "When a new job or workflow run is queued, any existing pending job or workflow run in the same group is canceled and replaced"; with `queue: max`, "Up to 100 jobs or workflow runs can be pending in the concurrency group"; and "The combination of `queue: max` and `cancel-in-progress: true` is not allowed". Google Testing Blog, "Efficacy Presubmit", 2018-09-17 (https://testing.googleblog.com/2018/09/efficacy-presubmit.html): "Continuous build will execute tests even when they have already passed at presubmit." Henderson et al., "Taming the Variants: Multi-Architecture Continuous Testing at Google", ICST 2026 (https://hackthology.com/taming-the-variants-multi-architecture-continuous-testing-at-google.html): 'TAP Presubmit does not conduct exhaustive testing. Instead, it operates in a "best-effort" mode'.

The same paper says Google stopped judging every change: "While it originally ran the affected tests (based on the build graph) at every single change [13], this quickly proved too expensive. Today, Postsubmit runs periodically". This pack keeps a verdict per push because its scale allows it. At this repo's 10.7 first-parent pushes a day (`heavy-lanes-state-their-daily-minutes`), an in-diff run near 10 job-min costs about 107 job-min a day, against about 3,500 to 4,500 runner-min a day for a whole-lane run on every push.

Gate: `review`. Does a heavy lane in the diff run on `pull_request`, skip a push to main, or let a later main push cancel or replace an earlier one (`cancel-in-progress` true on main, or a group shared across main commits without `queue: max`)? Does it share one fixed main-side group with `queue: max` without a comment saying why its runs must not overlap, or where its pushes per day times its run time could fill the 100-run queue? Can a `pull_request` trigger in the diff reach, directly, through `needs:` or through a called reusable workflow, a job that runs a main-only suite, a full VM test or a machine-image build? Does it set pull-request refs to anything but `cancel-in-progress: true`, scope a push run from anything but the lane's last green ancestor, omit the full-corpus fallback, schedule a full corpus, or size shards by anything but measured timings?
