---
title: Resource execution compiles directly to native Effect Scope and finalizers
applies_when:
  - executing or acquiring an external resource with a bounded lifetime
  - authoring execution methods on a resource algebra
  - managing process, socket, or container lifecycles
tags: [resource-algebra, scope, lifecycle, finalizer, acquire-release]
---

Resource acquisition must be bound directly to native Effect `Scope` lifecycles, never exposed as disconnected imperative `start()` and `stop()` methods:

- **Scoped Acquisition**: The specification or constructor exposes a scoped execution primitive (`scoped(spec)` or `spec.acquire`) returning `Effect<Resource, Error, Scope | ...>`.
- **Automatic Finalization**: Teardown, process termination, port release, and resource deletion are registered as finalizers on the active `Scope` using `Scope.addFinalizer` or `Effect.acquireRelease`.
- **Escalating Teardown**: Teardown logic must be resilient to fiber cancellation and interruption, escalating through graceful shutdown to forced termination (e.g. `stop` -> `kill` -> `destroy`).
- **No Orphaned Handles**: Consumers never manage lifecycle manually with `beforeAll` / `afterAll` hooks; exiting the enclosing `Effect.scoped` block guarantees clean disposal.
