---
title: Blueprint execution compiles directly to native Effect Scope and escalating finalizers
applies_when:
  - executing or acquiring an external target with a bounded lifetime (databases, containers, processes, sockets)
  - authoring compilation targets or finalizers for a blueprint
  - managing pipeline shutdown and cleanup across multiple cells
tags: [cell, scope, lifecycle, finalizer, acquire-release, resource-safety]
---

Acquisition of an external target must be bound directly to native Effect `Scope` lifecycles, never exposed as disconnected imperative `start()` and `stop()` methods:

### 1. Scoped Acquisition at the Edge

A blueprint exposes a scoped compilation target (`spec.scoped`) returning `Effect<Handle, Error, Scope | ...>`. The composition root or execution runner wraps the cell or blueprint execution in `Effect.scoped`. This guarantees every handle acquired across the interaction is finalized reliably on exit, error, or interruption.

### 2. No Mid-Pipeline Scope Closure

Never call `Effect.scoped` or `Effect.acquireRelease` inside domain cells, workflows, or inner sandwich phases. A scope closed mid-pipeline causes acquired handles to vanish prematurely, triggering silent failures in downstream steps. Unclosed scopes leave `Scope` in the `R` channel until wrapped at the process edge.

### 3. Automatic Finalization & Escalation

Teardown must be automatic and resilient against fiber interruption. When an acquiring fiber is cancelled or exits, cleanup finalizers execute in reverse acquisition order. Teardown of a handle drives its standalone operations through progressive termination stages:

```ts
const teardown = (handle: ProcessHandle): Effect.Effect<void> =>
  Effect.gen(function*() {
    // 1. Attempt graceful shutdown:
    yield* stopWithTimeout(handle, GRACEFUL_TIMEOUT_MS).pipe(
      // 2. Escalate to force-kill on timeout or defect:
      Effect.catchDefect(() =>
        killWithTimeout(handle, FORCE_KILL_TIMEOUT_MS).pipe(
          Effect.catchDefect(() => Effect.void),
        )
      ),
    )
    // 3. Final handle cleanup:
    yield* cleanup(handle, { force: true }).pipe(
      Effect.catchDefect(() => Effect.void),
    )
  }).pipe(Effect.uninterruptible)
```

```ts
// WRONG: imperative start/stop or premature scope closure inside a cell
let instance: RunningVM
beforeAll(async () => {
  instance = await driver.start(spec) // Leaks if the test crashes!
})

// RIGHT: scoped execution with automatic finalization
Effect.scoped(
  Effect.gen(function*() {
    const instance = yield* blueprint.scoped // Finalized on scope exit or interruption
    yield* instance.pipe(exec('ping'))
  }),
)
```

Gate: `type-checker`, `review` — unclosed scopes track `Scope` in `R` until wrapped in `Effect.scoped`; review that a blueprint provides `.scoped` with finalizers and exposes no unmanaged imperative lifecycle hooks, and that teardown escalates through the handle's operations in reverse acquisition order.
