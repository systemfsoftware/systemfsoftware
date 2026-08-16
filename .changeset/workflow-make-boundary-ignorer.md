---
"@systemfsoftware/stryker-plugins": minor
---

The `workflow-make-boundary` ignorer selects the mutation population mechanically.

Every mutant whose ancestor chain contains no `Workflow.make(...)` call argument is excised with
the named reason `NOT_INSIDE_WORKFLOW_MAKE`; mutants inside any make boundary pass through to the
other ignorers. The boundary is identity-contained through the call's arguments (nested makes
count), resolves named, aliased, and namespace imports of `Workflow`, and follows module-scope
function references. Ships as the `./workflow-make-ignorer` subpath wired like
`./effect-schema-ignorer`, with the AST schemas redeclared locally.
