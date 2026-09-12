---
"@systemfsoftware/oxlint-plugin-effect-workflow": minor
---

`make-file-location` and `workflow-file-make-presence` now recognize `Workflow.total` and
`Workflow.andThen` as constructors alongside `Workflow.make`.

A workflow-named file that builds its decision with a total decider or a chained pair is no longer
reported for a missing `Workflow.make` call, and both rules' messages name all three constructors
instead of `Workflow.make` alone. The location rule's one-construction-per-file limit counts totals
and composites too, so a workflow-named file that opens a second construction is now reported.

Move any construction the rules newly report out of the file that opens it and into the workflow-named
file that owns it.
