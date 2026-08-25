---
"@systemfsoftware/stryker-js-mutation-run": major
---

A failing run stage now says what failed. The five stage error types are one
`StageError` carrying the stage it came from, the reason, and the command when
there was one, and its message reads as a sentence — previously every stage
error carried an empty message, so anything that printed one printed nothing.

`PrepareFailedError`, `InstrumentFailedError`, `DryRunFailedError` and
`DryRunNoTestsError` no longer exist. Match on `StageError` and read its `stage`
field to recover the distinction. The exit code each failure produces is
unchanged.

An error's `cause` now survives being written to JSON, so a cause raised inside
a worker reaches the report instead of arriving empty.
