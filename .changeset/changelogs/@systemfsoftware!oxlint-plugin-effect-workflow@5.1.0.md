## 5.1.0

### Minor Changes

- `make-file-location` and `workflow-file-make-presence` now recognize `Workflow.total` and
  `Workflow.andThen` as constructors alongside `Workflow.make`.

  A workflow-named file that builds its decision with a total decider or a chained pair is no longer
  reported for a missing `Workflow.make` call, and both rules' messages name all three constructors
  instead of `Workflow.make` alone. The location rule's one-construction-per-file limit counts totals
  and composites too, so a workflow-named file that opens a second construction is now reported.

  Move any construction the rules newly report out of the file that opens it and into the workflow-named
  file that owns it.

- `workflow-variant-constructed` is a new recommended rule at `error`. A workflow whose
  decider declares a decision or error variant that no code path in the same file constructs
  now fails lint, instead of shipping a variant a consumer of the union can never receive.

  The declared channels come from the decider's `Result.Result<…, …>` return annotation —
  written inline, through an alias declared in the file, or as a `S.Union([…])` value the
  annotation names. A variant counts as constructed when the file builds it with `new X(…)`
  or `X.make(…)` anywhere, not only inside the decider. A variant whose class is imported
  rather than declared in that file is not judged, and type-test files are exempt.

  Construct the variant in the file, or delete it from the union and from every dispatch
  over it.
