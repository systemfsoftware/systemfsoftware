---
"@systemfsoftware/effect-cell-types": major
"@systemfsoftware/effect-daemon-spec": none
---

`Sandwich.read` is now `Sandwich.named(name)`. The name is the parent span. The run also records `<name>.read` and `<name>.write`, the decision or failure tag, and a histogram `app.<name>.duration` labeled only by result class (`success`, `failure`, or `infrastructure`). Pass `{ boundaries }` to override the default duration buckets, in seconds.

A command class passed to `Workflow.make` or `Workflow.total` declares the fields copied onto the span as `static readonly [Workflow.InstrumentationBrand] = [...] as const`. A missing list, or a key that is not a field of the class, is refused.

A failure inside a cell carries the span annotation on its cause, as any effect inside a span does.
