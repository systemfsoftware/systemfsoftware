---
"@systemfsoftware/effect-cell-types": major
---

Cells now decode and encode through the workflow's schemas, and `write` must handle every outcome, including input that fails the command schema.

- Replace `Workflow.total` and `Workflow.andThen` with `Workflow.make({ command, decision, error, decide })`, using `error: Schema.Never` when the decision cannot fail. A `decision` may also be a list of events: `Schema.Array(Schema.Union([...]))`.
- Remove `.decode(...)`, `.encode(...)` and `Sandwich.pure`. The chain is `Sandwich.named(name)(read).decide(workflow).write(handlers)`, and `read` returns the command's encoded form.
- Pass `write` one handler per decision tag, one per error tag, and one for `CommandRejected`.
- Replace `Cell.provide(layer)` with `Cell.provideContext(context)`, building the context once.
