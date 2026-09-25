---
"@systemfsoftware/trace-spec": minor
---

`Rel.Hold`, `Rel.Break` and `ObservationWindow.ObservationWindowSpec` are schema structs instead of classes, with unchanged encoded shapes: build them with `.make(...)` instead of `new`. The `VerdictTypeId` type is removed. `IncompleteObservationError.spanCount` must be a non-negative integer, and span `startMillis` and `durationMillis` must be finite and non-negative.
