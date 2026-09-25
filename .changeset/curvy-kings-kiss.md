---
"@systemfsoftware/effect-microsandbox": major
---

`ExposedPort`, `ServiceSpec`, `JobSpec` and `JobCompletion` are schema structs (`ServiceSpec` and `JobSpec` tagged) instead of classes. Their encoded shapes are unchanged; build values with `.make(...)` instead of `new`.
