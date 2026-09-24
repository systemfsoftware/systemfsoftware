---
"@systemfsoftware/differential-spec": minor
---

`runDifferentialWithShrink` and `runMetamorphicWithShrink` take the test's `expect` (before `options`) and end in one check: a pass is the check holding, and a disparity or break fails it with the report. `DisparityError` is removed. `differentialReport` and `metamorphicReport` return the `{ holds, report }` value for callers that judge it themselves, and `reportCheck(expect)(report)` turns one into a check. `compare` and the metamorphic DSL register each comparison as a generator test, keeping the host-bound timeout and annotation.
