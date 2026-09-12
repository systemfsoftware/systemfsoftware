---
"@systemfsoftware/effect-cell-types": major
---

The exported `Cell.run` helper is removed. Run a cell through its own arrow instead: `cell.run(input)` replaces `Cell.run(cell, input)`, in both the data-first and the curried form. The helper only forwarded to that arrow, so a migrated call site behaves identically.

The `Policy` type and `Cell.withPolicy` are removed. An execution strategy — retry, timeout, a restart cap — belongs to the interpreter: it is the only place that knows the write's idempotence and the deadline, and a strategy declared on the published value imposed re-execution of side effects on every consumer. Wrap the run at the edge with Effect's own combinators instead: `Effect.retry(cell.run(input), { times })`.
