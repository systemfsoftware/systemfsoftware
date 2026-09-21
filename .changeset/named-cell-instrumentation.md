---
"@systemfsoftware/effect-cell-types": major
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/differential-spec": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-gherkin-spec": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/effect-schema-law": none
"@systemfsoftware/effect-schema-recursion-budget": none
"@systemfsoftware/effect-schema-vite": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/npm-package": none
"@systemfsoftware/oxlint-config-recommended": none
"@systemfsoftware/oxlint-plugin-effect-platform": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
---

`Sandwich.read` is now `Sandwich.named(name)`. The name is the parent span. The run also records `<name>.read` and `<name>.write`, the decision or failure tag, and a histogram `app.<name>.duration` labeled only by result class (`success`, `failure`, or `infrastructure`). Pass `{ boundaries }` to override the default duration buckets, in seconds.

A command class passed to `Workflow.make` or `Workflow.total` declares the fields copied onto the span as `static readonly [Workflow.InstrumentationBrand] = [...] as const`. A missing list, or a key that is not a field of the class, is refused.

A failure inside a cell carries the span annotation on its cause, as any effect inside a span does.
