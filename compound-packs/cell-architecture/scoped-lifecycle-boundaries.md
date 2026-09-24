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

A resource exposes `resource.scoped`, returning `Effect<Handle, Error, Scope | …>`. The kind runs the handle's `create` and registers its release in the caller's `Scope` in one uninterruptible step, so no interruption lands between the two. The composition root or runner wraps the interaction in `Effect.scoped`, and every handle acquired inside it is released on success, failure, or interruption. A resource's `prepare` (probes, port allocation, planning) runs before the driver exists; it may be interrupted and may close its own scopes.

### 2. No Lifecycle in Cells

A `*.cell.ts` file neither registers a release nor closes a scope: no `Effect.acquireRelease`, `Effect.addFinalizer`, `Effect.scoped`, or `Scope.close`. A scope closed mid-pipeline releases a handle a later step still needs. Cells take the handle as data; the resource and handle kinds own both ends of its life.

### 3. Staged, Escalating Release

A release is a list of stages, and each stage is an escalation chain. A step runs only when the step before it in its stage failed or died, and every stage runs. A stage whose last attempted step failed dies with that failure, so the `Scope`'s exit carries it beside any failure of the body. Nothing is discarded:

```ts
release: ;
;[
  // stage 1: graceful stop, escalating to a forced kill only if the stop fails
  [
    (sandbox) => Effect.tryPromise(() => sandbox.stopWithTimeout(STOP_TIMEOUT_MS)),
    (sandbox) => Effect.tryPromise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MS)),
  ],
  // stage 2: always runs; if destroy fails, the Scope's exit carries the defect
  [(sandbox) => Effect.tryPromise(() => sandbox.destroy())],
]
```

A handle whose driver needs no release (an in-memory volume) declares none. A handle acquired through another handle (a file opened from a file system) is a child entry of the parent's definition and gets the same release in the caller's `Scope`. An operation called after release has started dies with `Handle.HandleReleased` before touching the driver.

```ts
// WRONG: a teardown that swallows every failure
Effect.promise(() => handle.cleanup()).pipe(Effect.catchDefect(() => Effect.void))

// WRONG: imperative start/stop that leaks when the test crashes
let instance: RunningInstance
beforeAll(async () => {
  instance = await driver.start(spec)
})

// RIGHT: scoped acquisition; the kind releases on exit or interruption
Effect.scoped(
  Effect.gen(function*() {
    const vm = yield* resource.scoped
    yield* vm.pipe(MicroVM.exec('ping'))
  }),
)
```

Gate: `Handle.make` builds the acquire-and-register step, the staged release, and the released flag; `pnpm --filter @systemfsoftware/effect-cell-types test` holds their behaviour (lifecycle scenarios and the staged-release property). `@systemfsoftware/oxlint-plugin-cell-architecture` rule `cell-file-owns-no-lifecycle` refuses release registration and scope closing in `*.cell.ts`. The type checker keeps `Scope` in `R` until `Effect.scoped` wraps it. The microsandbox smoke journeys in CI prove a real sandbox is gone after a closed and after an interrupted scope.
