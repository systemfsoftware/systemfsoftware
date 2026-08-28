---
title: Global type augmentations need a named carrier, not an incidental one
problem: The in-source test block of a plugin's hooks module failed typecheck with `Property 'vitest' does not exist on type 'ImportMeta'` after a mass deletion of files under the same package's tests directory — with zero changes to the failing module or its tsconfig.
problem_type: test-failures
track: bug
category: test-failures
filename: vitest-importmeta-augmentation-accidental-carrier
created: 2026-08-28
last_updated: 2026-08-28
tags:
  - typescript
  - type-augmentation
  - in-source-tests
  - mass-deletion
  - implicit-dependency
---

## Problem

A package whose module contains an `if (import.meta.vitest !== void 0)` in-source test block typechecked green for its whole life. A cleanup deleted every hand-assertive file under the package's `tests/` directory — files the failing module never imported. Immediately after, `tsc --noEmit` reported `TS2339: Property 'vitest' does not exist on type 'ImportMeta'` on the untouched module. Nothing about the module, its imports, or its tsconfig changed; the deletion was elsewhere in the program.

The failure is silent in the other direction and more dangerous: the green state was never caused by the mechanism everyone believed (the tsconfig). It was caused by an unrelated file's import graph, so the fix must target the carrier, not the symptom.

## Root cause

TypeScript's `ImportMeta.vitest` property does not exist in lib ES modules. It appears only when the compiled program includes vitest's global augmentation (`vitest/importMeta`), which binds itself onto the ambient `ImportMeta` interface for the entire program. Whether that augmentation loads depends on which files the program contains:

- Before deletion, the tests directory held integration suites that imported `vitest` directly. Compiling the package included those files, so the augmentation entered the program and every `import.meta.vitest` reference resolved.
- After deletion, no remaining file imported `vitest`. The augmentation left the program with them, and the in-source block — which only dynamically imports `@effect/vitest` inside the dead-at-build-time branch — lost the property.

The green typecheck was therefore certified by an unrelated file's side effect. This is the augmentation-shaped instance of a general class: any program-wide effect (global interface merging, ambient module declarations, `declare global` blocks, side-effect-only imports) is **load-bearing state whose carrier is implicit**. Deleting, moving, or tree-shaking the carrier fails every consumer, with no edge in any dependency graph pointing at the cause.

## Solution

Declare the augmentation's carrier explicitly at the point of consumption, in the package's tsconfig `types` array: `"types": ["node", "vitest/importMeta"]`. The `types` entry makes the compiler load the augmentation module by name for every program of that package, independent of which other files happen to compile. After the edit, clear the incremental build info file (`tsconfig.tsbuildinfo`) — `tsc --incremental` serves stale failures from cache and will mask the fix, making a correct change look unresolved.

The same mechanism generalizes to every augmenting module in the ecosystem (`@types/*` packages, Effect's ambient declarations, vitest's globals). Wherever a module augments a global, the consuming package must name it in `types` (or a triple-slash reference in the consuming file) rather than relying on some other file in the program importing it first.

## Architectural invariants

**Invariant — augmentation is declared at consumption, never inherited by accident.**
A program-wide augmentation used by module $M$ must be loadable when the program is $\{M\}$ alone. Formally: for each augmentation $A$ consumed by $M$, the declared dependency edge $M \to A$ must exist in package configuration; an observed edge from any unrelated file $F \to A$ certifies nothing about $M$'s compilability. A green check under a program containing $F$ is not evidence the program $\{M\}$ is well-typed — it is evidence only about that program.

**Invariant — deletion revises the program, so deletion re-runs the gate for survivors.**
Mass file deletion is not behavior-neutral for typecheck the way it is for unit tests: it can remove augmentations, ambient declarations, and side-effect imports that other survivors depended on. Any sweep that removes compiled files must re-run the full type gate on the surviving set and treat every new failure as a real finding about an implicit dependency, never as flakiness.

## Code smells

- `import.meta.vitest` (or any global-augmented property) in a file whose package tsconfig does not name the augmenting module in its `types` array — the reference compiles only while some other file keeps the augmentation loaded.
- A green typecheck that was never green in a program consisting of the file plus its tsconfig — the CHK1 smell: a check keyed on a state its own dependency graph does not supply.
- An in-source test block guarded by `if (import.meta.vitest ...)` whose only static vitest-related import sits _inside_ the guard — the branch that needs the type is exactly the branch whose imports the type-checker sees least.

## Verification

- Reproduce the failure shape: delete every file importing the augmenting package, run the type gate, observe the augmentee fail.
- Verify the fix end-to-end: clear the incremental cache file, re-run the type gate on the surviving program, observe green.
- Prove independence: the fix is complete when a program consisting of the consuming module plus its declared configuration typechecks with no other file in the include set.
