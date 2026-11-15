---
"@systemfsoftware/oxlint-plugin-cell-architecture": minor
---

`sandwich-shell-is-straight-line` also checks `Sandwich. It also reads the options-first form of both builders,`Sandwich.named(options)(name)(read)`and`Sandwich.writer(options)(name)(read)`, which it previously skipped, and it reads a chain split across`const`bindings, which it previously skipped as well.writer(name)(read).decode(Command).write(handlers)`. A writer's `read` and its `Decoded` and `CommandRejected` handlers are held to the same rule as a decided cell's read and write phases: control flow, dispatch and `Match` pipelines are reported in them, and `Clock` is reported in the handlers. A writer has no decision, so a branch it needs belongs in a cell built with `Sandwich.named` and its workflow.
