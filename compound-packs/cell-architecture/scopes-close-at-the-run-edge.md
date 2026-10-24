---
title: A cell phase or workflow never closes the scope of a handle it hands on; only the run edge closes it
applies_when:
  - acquiring a resource inside a cell phase, a workflow or a blueprint target
  - Scope appears in a cell's R channel and a change wants it gone
tags: [scope, lifecycle, finalizer, cell]
---

Never wrap an acquisition in Effect.scoped inside a cell phase or a workflow when the acquired handle, or a value holding it, leaves that Effect.scoped. Acquisition leaves Scope in R, and only the run edge (the composition root, or the target that runs the cell) closes it.

Acquiring a handle registers its release as a finalizer on the acquiring Scope (Effect.acquireRelease, or a blueprint's scoped target); a caller is never handed a handle whose release it must call by hand.

```typescript
// WRONG
.write({
  PlanApproved: (approved) => Effect.scoped(VM.make(approved.spec).scoped), // released before anything uses it
})
```

```typescript
// RIGHT
.write({
  PlanApproved: (approved) => VM.make(approved.spec).scoped, // Scope stays in R until the run edge closes it
})
```

Gate: judge
