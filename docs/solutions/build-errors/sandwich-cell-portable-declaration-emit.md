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

When downstream packages construct and export a cell via fluent builder combinators (`Sandwich.read(...).decide(...).write(...)`), TypeScript declaration emission (`tsc -b` or `declaration: true`) fails with:

```text
error TS2883: The inferred type of 'fulfillmentCell' cannot be named without a reference to 'Cell'. This is likely not portable. A type annotation is necessary.
```

The boundary is strictly cross-package declaration emission under isolated project references. The expression compiles and typechecks locally within the consuming unit without error, runtime execution is unaffected, and unit suites pass. The failure occurs only when the compiler must emit declarations for an exported value whose inferred type references an un-exported or unreachable companion symbol across module boundaries.

## Mechanism & Mathematical Failure Modes

1. **Nominal Type Reachability in Declaration Synthesis:**
   Let $E$ be an exported identifier whose type $T = \text{typeOf}(E)$ is inferred by the compiler. Let $\mathcal{S}_{\text{import}}$ be the set of symbols imported into the current module scope, and let $\mathcal{P}(\mathcal{S})$ be the set of reachable type paths synthesized from $\mathcal{S}$.
   Declaration emission succeeds if and only if every nominal component $C \in \text{components}(T)$ is reachable via an imported binding:

   $$\forall C \in \text{components}(T), \quad \exists p \in \mathcal{P}(\mathcal{S}_{\text{import}}) \text{ such that } \text{resolves}(p) = C$$

   If $C \notin \mathcal{P}(\mathcal{S}_{\text{import}})$, the compiler cannot name the type within the emitted signature:

   $$\text{emit}(\text{export const } E = \dots) \implies \text{TS2883 when } C \notin \mathcal{P}(\mathcal{S}_{\text{import}})$$

2. **Builder and Target Module Asymmetry:**
   The fluent builder chain in `Sandwich.EncodedChain.write` terminates by returning an intersection type containing `Cell<I, Resp, E, R>`. However, consumers consuming the builder API import only the builder namespace:

   ```ts
   import { Sandwich } from '@systemfsoftware/effect-cell-types'
   ```

   Here, $\mathcal{S}_{\text{import}} = \{ \text{Sandwich} \}$. Because `Cell` was declared exclusively in a sibling companion unit and exported at the package root as a standalone namespace barrel (`export * as Cell`), the symbol `Cell` is not an element of $\mathcal{P}(\{ \text{Sandwich} \})$.

3. **Fallback to Fragile Deep-Path Resolution:**
   Unable to synthesize a qualified path such as `Sandwich.Cell<...>`, the TypeScript declaration emitter attempts to synthesize an import using relative filesystem paths traversing internal vendor directories. Under project references and declaration emit rules, the compiler flags this non-portable path and aborts compilation with `TS2883`.

4. **Namespace Collision at Package Entry:**
   Attempting to resolve the reachability gap by exporting `Cell` both as a namespace barrel (`export * as Cell`) and as a bare type alias (`export type { Cell }`) at the package entry triggers `TS2300: Duplicate identifier 'Cell'` due to conflicting value and type symbol bindings in the same module scope.

## Architectural Invariants & Universal Rules

### Companion Namespace Type Reachability

Whenever a builder or combinator namespace $\mathcal{B}$ constructs or returns an instance of a domain interface $\mathcal{T}$ defined in a companion module, $\mathcal{B}$ must re-export $\mathcal{T}$ within its own namespace:

$$\text{returnType}(\mathcal{B}.\text{combinator}) \cap \mathcal{T} \neq \emptyset \implies \mathcal{T} \in \text{exports}(\mathcal{B})$$

This ensures that any consumer holding an import of the builder namespace $\mathcal{B}$ automatically has $\mathcal{T}$ reachable as $\mathcal{B}.\mathcal{T}$ in its type projection space $\mathcal{P}(\{ \mathcal{B} \})$.

```ts
// Builder module re-exports companion target type
export type { Cell } from './Cell.js'

// Allows TypeScript declaration emission to synthesize:
// export declare const fulfillmentCell: Sandwich.Cell<Order, Result, Error, Requirement>
```

### Anti-Pattern Code Smell

A builder or factory module that imports an interface solely for return type annotations without re-exporting the interface:

```ts
// ANTI-PATTERN: Returns companion type without re-exporting it
import type { Target } from './Target.js'

export const builder = (): Target => ({ ... })
// Downstream consumers importing { builder } cannot name Target portably!
```

```ts
// INVARIANT: Companion type is re-exported on the builder module/namespace
import type { Target } from './Target.js'
export type { Target } from './Target.js'

export const builder = (): Target => ({ ... })
// Downstream compiler synthesizes `builder.Target` or namespaced projection portably
```

AST audit pattern:

- Detect function or method return type annotations referencing imported type symbols that do not match any export specifier or export declaration in the defining module.

## Verification & Prevention

1. **Two-Sided Type Testing (TSTyche):**
   Verify both type equivalence and assignability under the namespace projection without importing the underlying module:

   ```ts
   // Verify companion namespace exposure
   expect<Sandwich.Cell<Cmd, void, never, never>>().type.toBe<Cell.Cell<Cmd, void, never, never>>()

   // Verify inference across chaining phases
   const cell = Sandwich.read(read).decide(decideOverRaw).write(writeOutcome)
   expect(cell).type.toBeAssignableTo<Sandwich.Cell<Cmd, void, never, never>>()
   ```

2. **Downstream Unannotated Consumer Compile Gate:**
   In consuming packages, enforce that exported cells omit manual type annotations and compile under strict project references (`tsc -b`):

   ```ts
   // Must compile cleanly under `tsc -b` with ZERO type annotations:
   export const fulfillmentCell = Sandwich.read(readOrder)
     .decode(decodeOrder)
     .decide(processOrder)
     .encode(encodeResult)
     .write(persistOrder)
   ```

3. **API Extractor Report Validation:**
   Ensure the API extractor report registers the companion type export within the namespace declaration:

   ```markdown
   export namespace Cell {
   export { Cell, DecodedChain, DecodedDecidedChain, EncodedChain, PurePhase, RawDecidedChain, ReadChain, pure, read };
   }
   ```

## Related Issues

- `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md` — Bundler-level pruning of re-exported type surfaces.
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — Asymmetry between declared package exports and emitted declaration rollups.
