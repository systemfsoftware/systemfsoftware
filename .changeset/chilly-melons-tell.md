---
"@systemfsoftware/effect-sim-kernel": major
---

Kernel.seedsFor and Kernel.currentSeedsFor take the baseline run (a Kernel.RunHistory) in place of a { fibers, steps } budget, and Kernel.Budget is removed. A baseline whose explored steps never had more than one runnable task to pick from — the running fiber included — has one schedule, so it gets 0 seeds; any other baseline gets the profile count (250 per-change, 25 local). A fiber forked and interrupted before it runs counts as a choice point. Kernel.pct applies the same rule when no seeds option is given, and its bound reports the runs it made: 1 for a choice-free program. That one run is judged: a choice-free program that fails is reported once, as seed 0, which replays it.
