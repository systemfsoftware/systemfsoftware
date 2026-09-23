---
"@systemfsoftware/discern": minor
---

Add @systemfsoftware/discern: uncertainty-aware semantic pattern matching and control flow over Effect's `DecisionModel`, imported as the `Discern` namespace. Classify, rate and probability questions become patterns with a three-valued verdict (`Match`, `Miss`, `Uncertain`) that compose with `and`, `or` and `not`, drive policies built with `when`, `onUncertain` and `orElse`, and an exhaustive `match`/`case`. A policy asks every question it needs in one model call. Answers can be traced, recorded and replayed without a model through `Discern.Model.replayLayer`, cached, and limited by a budget through `Discern.Model` interceptors. `Discern.Eval` scores and calibrates thresholds against labelled examples. `Discern.Procedure` routes a request between named procedures and reports `Uncertain` rather than picking a near-tie.
