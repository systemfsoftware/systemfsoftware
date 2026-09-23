---
"@systemfsoftware/effect-readiness": minor
---

`Readiness.awaitCondition` now checks the evidence from `HostProber` and `LogSource` against its schema on every poll. When the evidence does not match, `awaitCondition` fails with the new exported error `ProbeInputInvalid`, whose `issue` field holds the schema's message. A custom `HostProber` or `LogSource` that returns malformed evidence now fails instead of being evaluated as-is. The success result, `Satisfied | TimedOut`, is unchanged.

Telemetry now records each poll on its own: the span is `probe_condition` and the duration histogram is `app.probe_condition.duration`. They replace `await_condition` and `app.await_condition.duration`, which covered the whole wait.
