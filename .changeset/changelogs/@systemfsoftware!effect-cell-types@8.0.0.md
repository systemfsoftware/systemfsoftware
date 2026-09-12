## 8.0.0

### Major Changes

- The exported `Cell.run` helper is removed. Run a cell through its own arrow instead: `cell.run(input)` replaces `Cell.run(cell, input)`, in both the data-first and the curried form. The helper only forwarded to that arrow, so a migrated call site behaves identically.

  The `Policy` type and `Cell.withPolicy` are removed. An execution strategy — retry, timeout, a restart cap — belongs to the interpreter: it is the only place that knows the write's idempotence and the deadline, and a strategy declared on the published value imposed re-execution of side effects on every consumer. Wrap the run at the edge with Effect's own combinators instead: `Effect.retry(cell.run(input), { times })`.

### Minor Changes

- `Cell.gate` runs one Cell only when another's response carries a value: the value admits it to the inner Cell and the composed response wraps the inner response, carrying nothing skips the inner Cell entirely, and both Cells' error and service channels union.

  `Cell.collect` runs one Cell per item, in order, then folds the responses with a plain function. The first refusal fails the composed Cell with that item's own refusal. `Cell.collectAll` is the accumulate opt-in: an item's refusal travels to the fold as data, so the fold always runs over every result.

  Both combinators are callable in the curried and data-first styles, and neither requires a workflow brand at its call site.

- Two constructors join `Workflow.make`.

  `Workflow.total` brands a decision that cannot fail. A decider whose error channel is `never` no
  longer becomes a workflow that cannot be called; it carries the workflow brand and is accepted
  wherever a branded decision is, including `Cell.layer`'s `decide` slot. Like `make`, it takes the
  command schema class first, and it still refuses a decision with a single variant or a variant
  carrying no `_tag` to dispatch on.

  `Workflow.andThen` chains two workflows. The first workflow's decision becomes the second workflow's
  command, the composed workflow's error channel is the union of both components, and a refusal from
  the first short-circuits — the second never runs. The second workflow's command class is passed as a
  value, so the composed signature carries no adapter function.
