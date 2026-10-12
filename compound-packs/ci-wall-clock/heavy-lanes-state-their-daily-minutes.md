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

Every heavy lane states its runner-minutes per day at the repo's measured 7-day merge rate, in a header comment naming the run shape that figure prices (the run the lane starts on every push to main), the per-run minutes, the run ids they were measured on, and the 7-day first-parent merge count with its window.

The daily figure prices the run every push starts. Under `heavy-suites-judge-every-main-commit` that is an affected-only run scoped from the lane's last green commit; a full-corpus figure is the fallback's cost or a rejected counterfactual, and the header labels it as such, never as the lane's daily price.

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
# Cost: about 107 runner-min/day for the run every push to main starts, an in-diff run
# scoped from the lane's last green commit: 10 job-min per run, measured on the public
# gritlint's in-diff mutation run 38112987198 until this lane records its own, at 10.7
# pushes/day (75 first-parent commits on main, 2026-10-04T06:00Z to 2026-10-11T06:00Z).
# Fallback and rejected counterfactual, not the daily price: full-corpus runs took
# 324-422 job-min (runs 37925930619, 37946043552, 37952058012, 37962737026); one on
# every push would cost about 3,500-4,500 runner-min/day. The full corpus runs only on
# dispatch, on a change to the lane's own inputs, or when no green ancestor is found.
name: Mutation
```

The window above held 86 commits in all; the other 11 are subtree squashes and branch merges that land inside a push and start no run, so the first-parent count is the one that prices a lane.

Gate: `review`. Does a heavy lane the diff adds or changes lack a header comment stating its runner-minutes per day, the run shape that figure prices, the per-run minutes with the run ids behind them, and the 7-day first-parent merge count with its window? Does the daily figure price a run shape other than the one the lane starts on every push to main, or present a full-corpus figure as the lane's daily price instead of its fallback or a counterfactual?
