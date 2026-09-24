---
"@systemfsoftware/trace-spec": minor
---

The observation window is now a `Resource` and `Handle` cell kind.

- `ObservationWindow.make(serviceName).layer` now provides only `Observation` and `OtelTracer`; it no longer leaks `OtelTracerProvider` into the context.
- A failed tracer-provider shutdown surfaces as a defect in the scope's exit.
- `context`, `shutdown`, `isObservationWindow`, and the exported `TypeId` are removed; use the resource's `scoped`, `layer`, or `bind(key)`.
