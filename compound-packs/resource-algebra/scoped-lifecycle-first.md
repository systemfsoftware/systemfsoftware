---
title: Resource execution compiles directly to native Effect Scope and finalizers
applies_when:
  - executing or acquiring an external resource with a bounded lifetime
  - authoring execution methods on a resource algebra
  - managing process, socket, container, or database lifecycles
tags: [resource-algebra, scope, lifecycle, finalizer, acquire-release]
---

Resource acquisition must be bound directly to native Effect `Scope` lifecycles, never exposed as disconnected imperative `start()` and `stop()` methods:

### 1. Scoped Acquisition

The specification exposes a scoped execution primitive (`spec.scoped`) returning `Effect<Resource, Error, Scope | ...>`. Acquiring the resource registers all setup, health polling, and teardown steps directly onto the enclosing fiber's active `Scope`.

### 2. Automatic Finalization & Escalation

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
// WRONG: Imperative lifecycle management with leaky beforeAll / afterAll hooks
let instance: RunningInstance
beforeAll(async () => {
  instance = await driver.start(spec) // Leaks if test crashes or interrupts!
})
afterAll(async () => {
  await instance.stop()
})

// RIGHT: Scoped execution with automatic finalization
Effect.scoped(
  Effect.gen(function*() {
    const instance = yield* resource.scoped // Automatically finalized on scope exit or interruption
    yield* instance.exec('ping')
  }),
)
```

Gate: `review` — verify that resources provide `.scoped` with finalizers and do not expose unmanaged imperative lifecycle hooks.
