---
"@systemfsoftware/discern": minor
---

Add @systemfsoftware/discern, imported as the `Discern` namespace: branch on answers from Effect's `DecisionModel` with three-valued patterns (`Match`, `Miss`, `Uncertain`). Classify, rate and probability questions compose with `and`, `or` and `not`, and drive policies built with `when`, `onUncertain`, `orElse` and an exhaustive `match`/`case`. A policy asks all its questions in one model call. `Discern.Model` records, replays, caches and budgets answers. `Discern.Eval` calibrates thresholds on labelled examples. `Discern.Procedure` routes a request between named procedures and reports `Uncertain` instead of picking a near-tie. Every method has a same-named standalone function for `pipe`. Crossed thresholds and rejected commands fail on the typed error channel.
