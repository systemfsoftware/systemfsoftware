---
"@systemfsoftware/oxlint-make-boundary": minor
---

`WORKFLOW_CONSTRUCTOR_MEMBERS` now names `Workflow.total` and `Workflow.andThen` alongside
`Workflow.make`, and `MakeBoundary` carries `takesDeciderBody`.

`takesDeciderBody` is `false` for a composing constructor: `andThen` receives constructed workflows
where a decider would sit, so a body-scoped rule has no body to judge in the file that opens one.
