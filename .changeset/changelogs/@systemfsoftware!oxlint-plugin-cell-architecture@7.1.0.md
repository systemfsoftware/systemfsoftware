# @systemfsoftware/oxlint-plugin-cell-architecture@7.1.0

The `sandwich-shell-is-straight-line` fix text no longer sends display formatting into the decide workflow: a branch that chooses a domain outcome moves into decide, and a branch that only formats a decided outcome moves into a pure formatter in a plain module that the phase calls.

`sandwich-shell-is-straight-line` also checks `Sandwich.writer(name)(read).decode(Command).write(handlers)`. A writer's `read` and its `Decoded` and `CommandRejected` handlers are held to the same rule as a decided cell's read and write phases: control flow, dispatch and `Match` pipelines are reported in them, and `Clock` is reported in the handlers. A writer has no decision, so a branch it needs belongs in a cell built with `Sandwich.named` and its workflow.

The rule now also reads two forms it previously skipped, for both builders:

- the options-first form, `Sandwich.named(options)(name)(read)` and `Sandwich.writer(options)(name)(read)`;
- a chain split across `const` bindings.

A file that wrote either form may now report findings it did not report before.
