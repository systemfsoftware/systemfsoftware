---
title: A handle's release is a finalizer on the scope that acquired it, and only the run edge closes a scope whose handle is handed on
applies_when:
  - acquiring a resource inside a cell phase, a workflow or a blueprint target
  - Scope appears in a cell's requirement type and a change wants it gone
  - giving a caller a resource it would have to stop, close or release
tags: [scope, lifecycle, finalizer, cell, handle]
---

Register a handle's release as a finalizer on the acquiring Scope (`Effect.acquireRelease`, or a blueprint's `.scoped` target). Never hand a caller a handle with a release, close, stop or dispose operation it must call by hand: a failure or interruption in between leaks the resource.

Leave Scope in the requirement type; only the run edge (the composition root, or the code that runs the cell) closes it. Inside a cell phase, workflow or blueprint target, wrap an acquisition in `Effect.scoped` only when the handle and every value holding it are used and dropped inside that `Effect.scoped`; returning the handle from it hands the caller an already-released resource.

```typescript
// WRONG: released before anything uses it
PlanApproved: (approved) => Effect.scoped(VM.make(approved.spec).scoped),
// WRONG: the caller must remember to stop it
Effect.map(boot(spec), (vm) => ({ vm, stop: () => shutdown(vm) }))
// RIGHT
PlanApproved: (approved) => VM.make(approved.spec).scoped,
export const start = (spec: VmSpec) => Effect.acquireRelease(boot(spec), (vm) => shutdown(vm))
```
