---
"@systemfsoftware/effect-cell-types": major
---

The `Workflow.make` compiler now refuses a decision whose variants, or whose event-list elements, include a `Schema.TaggedError`, whatever the error schema, `Schema.Never` included. The refusal names `Workflow.ErrorClassDecision`. To migrate, declare the variant as a `Schema.TaggedClass`, or move it to the workflow's `error` schema.
