---
title: Every heavy lane states its runner-minutes per day at the repo's measured 7-day merge rate
applies_when:
  - adding a heavy lane (full-stack e2e, full corpus, mutation)
  - changing a heavy lane's triggers, scope, shards or job list
  - re-measuring a heavy lane's per-run cost or the repo's merge rate
tags: [ci, cost, runner-minutes, postsubmit, mutation]
---

A heavy lane whose cost is written nowhere is paid for without anyone deciding to. This repo's Mutation lane carried no cost. Its cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours") after the lane had been red on main since 2026-09-25; by then the 94 push runs since its last green one had used 372 job-hours.

## Rule

Every heavy lane states its runner-minutes per day at the repo's measured 7-day merge rate, in a header comment naming the per-run minutes, the run ids they were measured on, and the 7-day first-parent merge count with its window.

The merge rate is the count of first-parent commits on main in the 7-day window (`git rev-list --first-parent --count --since=<start> --until=<end> origin/main`); each squash merge is one push and one run. A run's minutes are the sum of its jobs' wall times.

```yaml
# WRONG: systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:1-15
# No cost header. The first cost figure appeared in #700's body after 14 red days.
name: Mutation

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: mutation-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

# RIGHT: neutral header for the same lane, built from measured numbers
# Cost: whole-lane push runs took 325-423 job-min (runs 37925930619, 37946043552,
# 37952058012, 37962737026). Main had 75 first-parent commits in the 7 days
# 2026-10-04T06:00Z to 2026-10-11T06:00Z (10.7/day), so a whole-lane run on every push
# costs about 3,500-4,500 runner-min/day.
name: Mutation
```

The window above held 86 commits in all; the other 11 are subtree squashes and branch merges that land inside a push and start no run, so the first-parent count is the one that prices a lane.

Gate: `review`. Does a heavy lane the diff adds or changes lack a header comment stating its runner-minutes per day, the per-run minutes with the run ids behind them, and the 7-day first-parent merge count with its window?
