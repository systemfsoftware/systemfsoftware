---
"@systemfsoftware/omp-claude-compat": major
---

`interpretHookResult` now returns the verdict together with the hook exit's code and stdout on both result channels. `SubmitVerdictCommand` is removed: call the decision directly with an `InterpretHookCommand`.
