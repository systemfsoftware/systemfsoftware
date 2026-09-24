---
"@systemfsoftware/trace-spec": minor
---

Requires `@systemfsoftware/vitest` installed under the `@effect/vitest` name (`"@effect/vitest": "npm:@systemfsoftware/vitest"`) in place of the upstream package. `Case.prop` checks the stimulus it is handed on every run and pins the run's input, so a stimulus that ignores its input fails; the trace dump path is annotated on the failing test.
