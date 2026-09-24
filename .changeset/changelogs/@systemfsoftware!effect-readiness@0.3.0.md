## 0.3.0

### Minor Changes

- `Readiness.target(...)` now returns a target blueprint. Await a condition with `target.awaitCondition(condition)`; the standalone `Readiness.awaitCondition(target, condition)` is removed. Set the deadline and polling interval with `withTimeout` and `withPoll`, as methods or through `pipe`.
