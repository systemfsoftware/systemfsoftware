---
"@systemfsoftware/stryker-js-plugin-api": major
"@systemfsoftware/stryker-test-contribution": minor
"@systemfsoftware/stryker-js-mutation-run": minor
---

An evaluator now answers with the verdict it reached instead of failing to
report one.

`Evaluator.evaluate` returns `ExitClass | null` on the success channel: the
class the run should end in, or `null` for nothing to report. `ExitClass` is
exported from `@systemfsoftware/stryker-js-plugin-api/evaluate`. The error
channel is for the evaluator itself breaking — a report it cannot read, a
decision it cannot reach.

Previously the only way to report a failed gate was to fail, which a caller
could not tell apart from the evaluator crashing, so neither the exit code nor
the message could distinguish them. If you wrote an evaluator that failed to
signal a verdict, return the class instead.

A run's verdict is now the most severe class anyone reported — the score against
your `break` threshold, plus every evaluator's answer.
