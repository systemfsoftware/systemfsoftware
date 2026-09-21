---
title: Internal cell pipelines and pure workflows drive execution without leaking port ceremony
applies_when:
  - implementing resource execution underneath a public resource algebra
  - connecting Cell sandwiches and workflows to scoped and layer constructors
  - designing the boundary between package core and consumer API
tags: [resource-algebra, cell, workflow, boundary, encapsulation]
---

The pure-core / imperative-shell architecture codified in `@systemfsoftware/effect-cell-types` remains the execution engine inside capability packages, but its internal mechanics must not force unnecessary ceremony onto consumers:

- **Encapsulated Cell Pipelines**: The five-phase sandwich chains (`read -> decode -> decide -> encode -> write`) and pure `Workflow.make` deciders model the internal steps of resource preparation, verification, and boot.
- **Engine Driven by Execution**: The scoped constructor (`scoped(spec)`) or layer constructor (`layer(spec)`) runs the internal cell pipeline directly using `cell.run(input)`.
- **Capability Requirements Propagate to R**: Platform capabilities required by the internal cells (such as `FileSystem.FileSystem` or `Crypto.Crypto`) cleanly accumulate in the `R` channel of `scoped(spec)` or the `RIn` of `layer(spec)`.
- **Zero Dummy Port Declarations**: Do not invent a `Context.Service` tag merely to wrap `cell.run`. Let the package's public constructor functions be the clean entry point to the pipeline.
