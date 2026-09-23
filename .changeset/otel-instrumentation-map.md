---
"@systemfsoftware/effect-cell-types": major
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/effect-readiness": none
---

`Workflow.InstrumentationBrand` now declares a map from command fields to OpenTelemetry attribute keys (`{ orderId: 'app.order.id' }`) instead of a field list. The parent span carries the mapped keys, and the run's outcome rides `app.<operation>.decision` or `app.<operation>.failure` instead of the bare `decision` and `failure` tags. A map value that is not a lowercase dot-separated key is refused at compile time alongside a key that is not a schema field. `Workflow.SpanAttributes<typeof Command>` derives the declared attribute record from the map, so a span declaration can pin its schema against the command's own instrumentation. Declare the map with `as const`: a list-shaped declaration stops compiling, and every declared span key changes to its mapped form.
