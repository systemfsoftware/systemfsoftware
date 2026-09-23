---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
---

The workflow rules now read the options-object form `Workflow.make({ command, decision, error, decide })` from `@systemfsoftware/effect-cell-types`. `make-body-purity`, `workflow-match-exhaustive` and `workflow-variant-constructed` check the `decide` property. `make-command-schema` checks the `command` property. `decide` can be an inline function or a module-scope function in the same file. `Workflow.total` and `Workflow.andThen` are no longer recognised as workflow constructors.
