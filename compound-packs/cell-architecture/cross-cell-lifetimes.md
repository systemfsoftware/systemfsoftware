---
title: Cross-cell resource lifetimes must close at the process edge via Effect.scoped
applies_when:
  - managing resources that span multiple cells or requests (database pools, worker threads)
  - using Scope, acquireRelease, or addFinalizer in cell composition
  - handling pipeline shutdown and resource cleanup
tags: [cell, scope, resource-safety, acquire-release, lifecycle]
---

Resources whose lifetime spans a cell pipeline (database connection pools, temporary scratch directories, worker processes) must register finalizers on a `Scope` opened at the outer execution edge:

- **Edge Scope Closure**: The composition root or execution runner wraps the cell's `run` invocation in `Effect.scoped`. This guarantees all resources acquired across the pipeline are finalized reliably on exit, error, or interruption.
- **No Scopes Mid-Pipeline**: Never call `Effect.scoped` or `Effect.acquireRelease` inside domain cells, library packages, or inner sandwich phases. A scope closed mid-pipeline causes acquired resources to vanish prematurely, triggering silent failures in downstream cells.
- **Interruption Safety**: When an outer interaction is cancelled, Effect's interruption model flows through the active phase and runs all cleanup finalizers in reverse acquisition order.

```ts
// WRONG: closing scope inside a cell deletes resources needed downstream
export const initStorageCell = Cell.fromEffect(
  Effect.scoped(
    Effect.gen(function*() {
      const dir = yield* createTempDir() // deleted as soon as initStorageCell returns!
      return dir
    }),
  ),
)

// RIGHT: resource acquisition leaves Scope in R; edge manages lifetime
export const initStorageCell = Cell.fromEffect(
  Effect.acquireRelease(
    createTempDir(),
    (dir) => cleanupTempDir(dir),
  ),
) // R carries Scope

// At edge (main.ts):
const program = Effect.scoped(pipelineCell.run(input))
NodeRuntime.runMain(program)
```

Gate: `type-checker` — unclosed scopes track `Scope` in the cell's `R` channel until wrapped in `Effect.scoped`.
Lint: `oxlint` bans `Effect.scoped` calls inside non-root packages.
