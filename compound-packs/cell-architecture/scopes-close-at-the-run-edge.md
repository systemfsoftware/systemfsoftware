---
title: A handle's release is a finalizer on the scope that acquired it, and only the run edge closes a scope whose handle is handed on
applies_when:
  - acquiring a resource inside a cell phase, a workflow or a blueprint target
  - Scope appears in a cell's requirement type and a change wants it gone
  - giving a caller a resource it would have to stop, close or release
tags: [scope, lifecycle, finalizer, cell, handle]
---

Acquiring a handle registers its release as a finalizer on the acquiring Scope (`Effect.acquireRelease`, or a blueprint's `.scoped` target). No caller is handed a handle with a release, close, stop or dispose operation it must call by hand. Acquisition leaves Scope in the requirement type, and only the run edge closes it: the composition root, or the code that runs the cell. Inside a cell phase, a workflow or a blueprint target, `Effect.scoped` may wrap an acquisition only when the handle and every value holding it are used and dropped inside that `Effect.scoped`.

**Decision test.** For each acquisition the diff adds, find the scope that closes it. The rule fails when an `Effect.scoped` inside a cell phase, a workflow or a blueprint target returns the handle or a value holding it, or when the handle's release is an operation its caller must invoke instead of a finalizer on the acquiring scope.

**Defect it prevents.** In the first case the handle is released before anything uses it: the caller receives a stopped VM or a closed connection. In the second, a failure or interruption between acquiring and the manual release leaks the resource: a VM that keeps running, a connection never returned to its pool.

```typescript
// WRONG
.write({
  PlanApproved: (approved) => Effect.scoped(VM.make(approved.spec).scoped), // released before anything uses it
})
// WRONG
export const start = (spec: VmSpec) =>
  Effect.map(boot(spec), (vm) => ({ vm, stop: () => shutdown(vm) })) // the caller must remember to stop it
```

```typescript
// RIGHT
.write({
  PlanApproved: (approved) => VM.make(approved.spec).scoped, // Scope stays in R until the run edge closes it
})
// RIGHT
export const start = (spec: VmSpec) => Effect.acquireRelease(boot(spec), (vm) => shutdown(vm))
```

**Source.** Effect's `Effect.acquireRelease`: "the release finalizer is added to the current scope and is guaranteed to run when that scope closes" (effect/src/Effect.ts in Effect-TS/effect). @systemfsoftware/effect-cell-types src/Blueprint.ts: a blueprint's `.scoped` target compiles it into acquisition (https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types).

Gate: judge
