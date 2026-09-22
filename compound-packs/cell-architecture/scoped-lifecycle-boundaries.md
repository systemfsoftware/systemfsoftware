---
title: Resource execution compiles directly to native Effect Scope and escalating finalizers
applies_when:
  - executing or acquiring an external resource with a bounded lifetime (databases, containers, processes, sockets)
  - authoring execution methods or finalizers on a resource specification
  - managing pipeline shutdown and resource cleanup across multiple cells
tags: [cell, scope, lifecycle, finalizer, acquire-release, resource-safety]
---

Resource acquisition must be bound directly to native Effect `Scope` lifecycles, never exposed as disconnected imperative `start()` and `stop()` methods:

### 1. Scoped Acquisition at the Edge

The resource specification exposes a scoped execution primitive (`spec.scoped`) returning `Effect<Resource, Error, Scope | ...>`. The composition root or execution runner wraps the cell or resource execution in `Effect.scoped`. This guarantees all resources acquired across the interaction are finalized reliably on exit, error, or interruption.

### 2. No Mid-Pipeline Scope Closure

Never call `Effect.scoped` or `Effect.acquireRelease` inside domain cells, workflows, or inner sandwich phases. A scope closed mid-pipeline causes acquired resources to vanish prematurely, triggering silent failures in downstream steps. Unclosed scopes leave `Scope` in the `R` channel until wrapped at the process edge.

### 3. Automatic Finalization & Escalation

Teardown must be automatic and resilient against fiber interruption. When an acquiring fiber is cancelled or exits, cleanup finalizers execute in reverse acquisition order. Teardown should escalate through progressive termination stages:

```ts
const teardown = (handle: ExternalProcessHandle): Effect.Effect<void> =>
  Effect.gen(function*() {
    // 1. Attempt graceful shutdown:
    yield* Effect.promise(() => handle.stopWithTimeout(GRACEFUL_TIMEOUT_MS)).pipe(
      // 2. Escalate to force-kill on timeout or defect:
      Effect.catchDefect(() =>
        Effect.promise(() => handle.killWithTimeout(FORCE_KILL_TIMEOUT_MS)).pipe(
          Effect.catchDefect(() => Effect.void),
        )
      ),
    )
    // 3. Final resource cleanup:
    yield* Effect.promise(() => handle.cleanup({ force: true })).pipe(
      Effect.catchDefect(() => Effect.void),
    )
  }).pipe(Effect.uninterruptible)
```

```ts
// WRONG: Imperative start/stop or premature scope closure inside cell
let instance: RunningInstance
beforeAll(async () => {
  instance = await driver.start(spec) // Leaks if test crashes!
})

// RIGHT: Scoped execution with automatic finalization
Effect.scoped(
  Effect.gen(function*() {
    const instance = yield* resource.scoped // Automatically finalized on scope exit or interruption
    yield* instance.exec('ping')
  }),
)
```

Gate: `type-checker` — unclosed scopes track `Scope` in `R` until wrapped in `Effect.scoped`.
Review: verify resources provide `.scoped` with finalizers and do not expose unmanaged imperative lifecycle hooks.
