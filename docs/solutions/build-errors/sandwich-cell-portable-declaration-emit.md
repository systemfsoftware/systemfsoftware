---
title: "Combinator Inferred Return Type Portability in Declaration Emission"
date: 2026-09-21
category: build-errors
module: effect-cell-types
problem_type: build_error
component: effect-cell-types
symptoms:
  - "TS2883: The inferred type of '...' cannot be named without a reference to 'Cell' from unexported companion module path. This is likely not portable. A type annotation is necessary."
  - "Downstream packages fail declaration emit when exporting inferred Sandwich pipeline cells"
  - "Consumers forced to write verbose 4-parameter Cell.Cell type annotations or dummy runtime references"
root_cause: type_definition_drift
resolution_type: architectural_change
severity: medium
tags:
  - typescript
  - declaration-emit
  - effect-cell-types
  - sandwich
  - cell
  - portable-types
  - type-inference
---

# Combinator Inferred Return Type Portability in Declaration Emission

## Problem & Observable Boundary

When a downstream package exports a cell built with `Sandwich.read(...)...write(...)` without an explicit type annotation, TypeScript declaration emission (`tsc -b` or `tsc --declaration`) aborts:

```text
error TS2883: The inferred type of 'fulfillmentCell' cannot be named without a reference to 'Cell'. This is likely not portable. A type annotation is necessary.
```

The failure is strictly observable at the package boundary during declaration emission (`.d.ts` generation) under TypeScript project references. Inside the defining package, local typechecking (`tsc --noEmit`), runtime execution, and vitest suites all pass. The error surfaces only when TypeScript attempts to write the public declaration signature for an exported value whose inferred type contains an unexported companion symbol.

## Mechanism & Failure Modes

1. **Companion Type Isolation:** The `Sandwich` builder module constructs and returns an instance of `Cell.Cell<I, A, E, R>`. However, consumers consuming the builder API import only `Sandwich`:
   ```ts
   import { Sandwich } from '@systemfsoftware/effect-cell-types'
   ```
2. **Missing Qualified Name in Imported Scope:** When emitting declarations for `export const cell = Sandwich.read(...)...`, TypeScript looks for a visible, exported type path in the consumer's module scope to name the return type. Because `Cell` was exported only as a sibling namespace barrel (`export * as Cell`) at the package entry, the consumer's scope has no binding named `Cell`, only `Sandwich`.
3. **Deep-Path Fallback Rejection:** Lacking a public name like `Sandwich.Cell`, the declaration emitter falls back to generating a relative file-path reference into package internals (`import('../../node_modules/.../Cell.js').Cell`). TypeScript flags relative imports traversing outside project root boundaries as non-portable and rejects the emit with `TS2883`.
4. **Duplicate Identifier Collision at Root:** Attempting to fix the reachability gap by exporting `Cell` as both a namespace barrel (`export * as Cell`) and a bare type alias (`export type { Cell }`) at the package root fails with `TS2300: Duplicate identifier 'Cell'`.

## Architectural Invariant

**Companion Namespace Type Reachability:** If a builder or combinator namespace `B` returns an instance of an interface `T` defined in a companion module, `B` must re-export `T` within its own namespace.

```ts
// Sandwich namespace re-exports Cell type
export type { Cell } from './Cell.js'
```

When a consumer imports `Sandwich`, the companion interface is reachable as `Sandwich.Cell`. TypeScript can then synthesize portable declaration signatures directly from the consumer's existing import:

```ts
// Emitted .d.ts in consuming package:
export declare const fulfillmentCell: Sandwich.Cell<Order, Result, Error, Requirement>
```

### Anti-Pattern Code Smell

A builder module that imports a type from a sibling module solely to type its return values, without re-exporting that type on the builder itself:

```ts
// ANTI-PATTERN: Consumer cannot name Target without importing it separately
import type { Target } from './Target.js'
export const make = (): Target => ({ ... })
```

```ts
// INVARIANT: Companion type is re-exported on the builder module
import type { Target } from './Target.js'
export type { Target } from './Target.js'
export const make = (): Target => ({ ... })
```

## Verification & Prevention

- **Type Tests (TSTyche):** Assert in the package type tests that the companion type is accessible on the builder namespace and that combinator chains infer to it:
  ```ts
  expect<Sandwich.Cell<Cmd, void, never, never>>().type.toBe<Cell.Cell<Cmd, void, never, never>>()

  const cell = Sandwich.read(read).decide(decideOverRaw).write(writeOutcome)
  expect(cell).type.toBeAssignableTo<Sandwich.Cell<Cmd, void, never, never>>()
  ```
- **Unannotated Downstream Consumer Compile:** Consuming packages export cells directly from builder invocations with zero type annotations. Declaration emission (`tsc -b`) must exit 0 without `TS2883`.
- **API Surface Report:** The public API extractor report must reflect the companion type export inside the builder namespace definition.

## Related Issues

- `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md` — Bundler-level pruning of re-exported type surfaces.
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — Asymmetry between declared package exports and emitted declaration rollups.
