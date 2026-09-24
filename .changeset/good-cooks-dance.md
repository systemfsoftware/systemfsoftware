---
"@systemfsoftware/differential-spec": minor
---

A differential check that finds no disparity now counts as an assertion of the test it runs in, and a check whose property run was interrupted is reported as inconclusive instead of passing.

`Differential.compare` and `Metamorphic.on` checks no longer carry a wall-clock test timeout: their work is bounded by runs and schedules, so a loaded machine cannot fail a correct check. A check whose side touches the host declares its own limit with the new `hostBound: { timeout, reason }` option, and the reason is shown on the test.
