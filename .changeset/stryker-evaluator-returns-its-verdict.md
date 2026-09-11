---
"@systemfsoftware/stryker-test-contribution": major
---

The evaluator returns its judgement instead of logging it, so a failing gate can explain itself and the run's exit status reflects it: a verdict is `{ exitClass, message? }`, and `null` means "no verdict". `effect` is no longer a dependency.

The gate activates by being listed in `plugins` (its contribution is named `contribution-gate`), and its message is reported by the run rather than by the plugin.
