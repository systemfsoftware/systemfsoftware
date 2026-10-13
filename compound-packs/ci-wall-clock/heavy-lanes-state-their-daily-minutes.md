---
title: Every heavy lane states its runner-minutes per day, a per-push lane at the repo's measured 7-day merge rate and a nightly lane by its night's run
applies_when:
  - adding a heavy lane (full-stack e2e, full corpus, mutation)
  - changing a heavy lane's triggers, scope, shards, `matrix` or job list
  - re-measuring a heavy lane's per-run cost or the repo's merge rate
tags: [ci, workflows, cost, runner-minutes, postsubmit, mutation]
---

A heavy lane whose cost is written nowhere is paid for without anyone deciding to. This repo's Mutation lane carried no cost. Its cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours") after the lane had been red on main since 2026-09-25; by then the 94 push runs since its last green one had used 372 job-hours.

## Rule

Every heavy lane states its runner-minutes per day in a header comment naming the run shape that figure prices, the per-run minutes and the run ids they were measured on; before a run in the lane's current shape exists, a figure modelled from a measured run is labelled as a model and names that run. A lane that runs on every push to main prices the run each push starts at the repo's measured 7-day merge rate, and states the 7-day first-parent merge count with its window. A nightly lane (`mutation-runs-nightly-on-main`) prices one night's run, and each dispatch on top of it, with no merge rate.

For a per-push lane, the daily figure prices the run every push starts. Under `heavy-suites-judge-every-main-commit` that is an affected-only run scoped from the lane's last green commit; a full-corpus figure is the fallback's cost or a rejected counterfactual, and the header labels it as such, never as the lane's daily price.

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

# RIGHT: systemfsoftware/systemfsoftware 4ae7e9e17c:.github/workflows/mutation.yml:1-8
# The same lane run once a night: one night's run is the daily price, with each dispatch on
# top, the run shape named and the run it was measured on.
# Cost: 0 runner-min/day today: this lane starts only on workflow_dispatch, the stopgap #700 set. #733
# adds a nightly schedule on main and keeps workflow_dispatch; Mutation never runs on a push or a pull
# request. Each run mutates the full corpus. Before the workflow-only change a full run took 422 job-min,
# measured on run 37962737026 (2026-10-09, 244 files in 26 packages). After it, a run mutates 54 files in
# 14 packages and is not yet measured; that run's per-package mutant counts model it at about 179 job-min.
# At #733's one nightly run a day that is about 179 runner-min/day after the change against 422 before,
# plus the same again for each manual dispatch. Main's 76 first-parent commits from 2026-10-06T00:00Z to
# 2026-10-13T00:00Z (10.9 a day) start no run: the price is per night, not per commit.
name: Mutation

# RIGHT: neutral header for a per-push lane, no citation; numbers are placeholders.
# Cost: about <runs a day x per-run> runner-min/day for the run every push to main starts, an
# affected-only run scoped from the lane's last green commit: <per-run> job-min per run (runs
# <ids>), at <N> pushes/day (<count> first-parent commits on main, <start> to <end>). The full
# corpus, <full-run> job-min, is the fallback's cost, not the daily price.
name: E2E
```

A 7-day window on this repo's main held 86 commits in all (2026-10-04T06:00Z to 2026-10-11T06:00Z), 75 of them first-parent; the other 11 are subtree squashes and branch merges that land inside a push and start no run, so the first-parent count is the one that prices a per-push lane.

Gate: `review`. Does a heavy lane the diff adds or changes lack a header comment stating its runner-minutes per day, the run shape that figure prices, and the per-run minutes with the run ids behind them (or, for a modelled figure, the label and the run it was modelled from), or, for a per-push lane, the 7-day first-parent merge count with its window? Does the daily figure price a run shape other than the one the lane starts on every push to main (or, for a nightly lane, its one night's run plus each dispatch on top of it, with no merge rate), or present a full-corpus figure as a per-push lane's daily price instead of its fallback or a counterfactual?
