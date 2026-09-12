---
"@systemfsoftware/all": patch
"@systemfsoftware/oxlint-plugin": patch
"@systemfsoftware/oxlint-plugin-recommended": patch
"@systemfsoftware/oxlint-plugin-effect-dmmf": patch
"@systemfsoftware/stryker-js": patch
---

The recommended oxlint set now carries `workflow-variant-constructed` and `runtime-construction-placement` at `error`, and the make-keyed workflow rules recognize the `Workflow.total` and `Workflow.andThen` constructors as lawful workflow construction.
