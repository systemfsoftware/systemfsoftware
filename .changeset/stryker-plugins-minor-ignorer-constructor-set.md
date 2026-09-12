---
"@systemfsoftware/stryker-plugins": minor
---

`workflow-make-boundary` now recognizes `Workflow.total` as a body-bearing boundary alongside
`Workflow.make`, and treats `Workflow.andThen` as a composing boundary.

Mutants inside a `Workflow.total` decider body stay live exactly as `make`-body mutants do, so a
total decider's logic is measured rather than ignored. The arguments of an `andThen` composite hold
no decider, so nothing in them joins the mutation population.

The boundary's ignore reason now names both constructors:
`mutant is outside every Workflow.make and Workflow.total decision body; only decider bodies are the mutation population`.
