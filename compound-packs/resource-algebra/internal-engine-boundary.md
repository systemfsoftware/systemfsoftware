---
title: Internal cell pipelines and pure workflows drive execution without leaking port ceremony
applies_when:
  - implementing resource execution underneath a public resource algebra
  - connecting Cell sandwiches and workflows to scoped and layer constructors
  - designing the boundary between package core and consumer API
tags: [resource-algebra, cell, workflow, boundary, encapsulation]
---

The pure-core / imperative-shell architecture codified in `@systemfsoftware/effect-cell-types` remains the execution engine inside capability packages, but its internal mechanics must not force unnecessary ceremony onto consumers:

### 1. Encapsulated Cell Pipelines

The five-phase sandwich chains (`read -> decode -> decide -> encode -> write`) and pure `Workflow.make` deciders model the internal steps of resource preparation, verification, and boot:

- **Preflight Probes**: Checks host dependencies, virtualization support, or network availability.
- **Plan Synthesis**: Validates resource constraints, resolves default configurations, and renders executable plans.
- **Readiness Probes**: Executes polling loops, evaluates wait strategies, and inspects health endpoints.

### 2. Direct Compilation to Effect Primitives

The public scoped constructor (`scoped(spec)` or `spec.scoped`) runs the internal cell pipeline directly using `cell.run(input)`. Consumers interact with standard Effect `Scope` and `Layer` primitives, not raw cell runners.

### 3. Capability Requirements Propagate to R

Platform capabilities required by the internal cells (such as `FileSystem.FileSystem` or `Crypto.Crypto`) cleanly accumulate in the `R` channel of `spec.scoped` or the `RIn` of `spec.layer`. They are provided once at the application or test composition root (e.g. `@effect/platform-node/NodeServices`).

```ts
// WRONG: Wrapping internal cell execution in dummy Context.Service tag
export class ResourceEngine extends Context.Service<ResourceEngine, {
  readonly start: (spec: ResourceSpec) => Effect<RunningResource, ...>
}>()('ResourceEngine') {}
// Forces consumer to yield tag from Context just to run the cell pipeline!

// RIGHT: Direct compilation from definition to scoped resource
export const scoped = (spec: ResourceSpec): Effect.Effect<RunningResource, ResourceError, Scope | Crypto | FileSystem> =>
  Effect.map(bootPipeline.run(spec), runningResourceOf)
```

Gate: `type-checker` — verify internal cell execution is encapsulated inside constructor methods and no dummy service tags are exported.
