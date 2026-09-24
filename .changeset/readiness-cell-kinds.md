---
"@systemfsoftware/effect-readiness": minor
---

`Readiness.target(...)` now returns a target resource. Await a condition with `target.awaitCondition(condition)`; the standalone `Readiness.awaitCondition(target, condition)` is removed. Set the deadline and polling interval with `withTimeout` and `withPoll`, as methods or through `pipe`.
