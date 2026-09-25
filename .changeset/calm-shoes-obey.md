---
"@systemfsoftware/effect-gherkin-spec": minor
---

`StepError` now has a message naming the keyword, the resolved step text and a summary of the cause, for example `Given "a user logs in" failed: Unauthorized {"user":"bob"}`, and its stack leads with the spec line that wrote the step. Steps are recorded as spans, so a failing scenario reports which steps passed and which failed.
