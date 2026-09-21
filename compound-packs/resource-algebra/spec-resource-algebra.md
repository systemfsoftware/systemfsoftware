---
title: Specifications form an immutable, fluent data algebra with lawful phase ordering
applies_when:
  - designing a configuration or specification model for an external resource
  - authoring builders or combinators for container, worker, or sandbox definitions
  - structuring the input channel of a capability package
tags: [resource-algebra, spec, immutable, fluent-algebra, lawful-builder]
---

A specification for an external resource (e.g. a microVM, container, process, or database instance) is an immutable data definition. It must never perform side effects or initiate network/process operations upon creation:

- **Lawful Staged Builder**: Like the five-phase sandwich chain in cell architecture, execution ordering is enforced by construction. It is nonsensical to construct or acquire a resource without establishing its identity first. The entrypoint requires mandatory identity (e.g. `spec(image)`), returning a configured builder that only then exposes combinators and terminal execution properties (`.scoped`, `.layer`).
- **Pure Fluent Builders**: Specifications provide fluent, chainable transformation methods (`withExposedPorts`, `withEnv`, `withMount`) that return a new immutable specification value.
- **Data-First and Data-Last Parity**: Combinators support both object method chaining (`spec.withExposedPorts([80])`) and standalone pipeable combinators for functional composition (`pipe(spec, withExposedPorts([80]))`).
- **No Direct Driver Imports**: The specification module must remain pure. It must not import native binary drivers, network sockets, or execution engines.
- **Validation on Ingestion or Construction**: Configuration invariants (e.g. port range validation, image reference formatting) are enforced via Effect `Schema` or constructor invariants.

```ts
// WRONG: Untagged property bag with unconstrained standalone execution methods
const rawSpec = { image: 'alpine:3.20', ports: [8080] }
const vm = yield * microvm.start(rawSpec) // Requires yielding fake driver service

// RIGHT: Lawful staged builder; identity required before execution is accessible
const alpine = MicroVM.spec('alpine:3.20')
  .withExposedPorts([8080])
  .withWaitStrategy(MicroVM.Wait.forPort(8080))

// Terminal execution is accessible directly on the configured specification:
const vm = yield * alpine.scoped
const AlpineLayer = alpine.layer
```

Gate: `type-checker` — terminal execution methods (`scoped`, `layer`) exist only on the result of `spec(...)`, preventing uninitialized or headless resource acquisition.
