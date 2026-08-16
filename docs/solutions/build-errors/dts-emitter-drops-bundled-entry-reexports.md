---
title: "tsgo dts emit drops public names from bundled entry re-exports"
date: 2026-08-16
category: build-errors
module: effect-atom
problem_type: build_error
component: tooling
symptoms:
  - "oxlint import(no-cycle) warns between the Result module and its schema implementation"
  - "shipped entry dts omits public value exports while every in-repo gate stays green"
  - "runtime mjs exports a name the shipped dts does not type (asymmetric surface)"
root_cause: missing_tooling
resolution_type: code_fix
severity: high
tags:
  - tsgo
  - tsdown
  - dts
  - re-export
  - strip-internal
  - shipped-surface
  - silent-pass
fix_prs: [830671e3c37]
---

# tsgo dts emit drops public names from bundled entry re-exports

## Problem & Observable Boundary

Breaking the import cycle inside `@systemfsoftware/effect-atom`'s `Result` module silently removed six public names (`TypeId`, `failure`, `initial`, `success`, `isResult`, `isAsyncResult`) from the shipped entry dts while every in-repo gate stayed green. The breakage is observable only where the package boundary is crossed: a consumer import of any dropped name against the built types. Locally, tests compile against package `src` through the `@systemfsoftware/source` condition, `dts:check` typechecks emitted files without ever importing the names, and `attw` validates resolution paths, not name completeness — so the defect passes CI and lands in the published tarball.

Boundary: the drop occurs only when the dts bundle inlines a non-entry leaf module into a per-entry shared chunk — exactly the shape tsdown produces for a package whose entry re-exports implementation-leaf modules.

## Mechanism & Failure Modes

1. **`export { names } from` clause pruning.** The tsgo dts bundler inlines the target module into the entry's shared chunk, renames its symbols, then prunes exports nothing in the emitted surface references. A re-export clause that names only VALUEs (never referenced again in dts-land — the entry's own signatures use only types) is pruned wholesale. A same-module `export { names }` of already-imported bindings is kept as a first-class entry export.
2. **`@internal` + `stripInternal: true` statement removal.** A JSDoc `@internal` tag above a re-export statement removes the entire statement from the emitted dts. This is additive on top of (1): a clause that survives one trap dies in the other; a local-binding export died from neither.
3. **Silent-pass triad.** No in-repo gate reads the shipped entry through a consumer lens: tests compile `src` (source condition), `dts:check` never imports the names, `attw` checks path/condition resolution only. All three green while the surface is broken — the exact shape of a silent-pass verification gap.
4. **Asymmetric surface.** Runtime `.mjs` still exports the names (the JS bundler keeps the clause); only the types drop. Downstream failure mode then depends on the consumer's own `stripInternal` and TS settings — nondeterministic breakage across consumer builds.

## Architectural Invariants

### Shipped-Surface Assertion

The public surface of a publishable package is what a strict consumer can import from the BUILT entry — never what compiles from `src`. The invariant: every documented public name is importable from the built entry dts.

```ts
// strict consumer compile — no @systemfsoftware/source, built entry only
import { failure, initial, isAsyncResult, isResult, success, TypeId } from '<pkg>/Result' // the BUILT entry resolution
import type { Result } from '<pkg>/Result'
const a: Result.Success<number, string> = success(42) // namespace members too
void a, failure, initial, isResult, isAsyncResult, TypeId
```

### Re-Merge Cohesion

A type alias and its merged namespace must be declared in the SAME module. The merged symbol is then carried whole by a plain type re-export (`export type { Result }`); consumers obtain `Result.Proto`, `Result.Success<R>`, `Result.Failure<R>` through it. Declaring the namespace in the entry module over an aliased import duplicates the surface and invites drift.

### Local-Binding Re-export

In a tsdown entry whose source modules get dts-inlined, export values through the local bindings, never through an `export { names } from` clause:

```ts
// entry re-exports the imported bindings of the shared leaf — no from-clause
import { failure, initial, isResult, success, TypeId } from '<leaf-module>'
export { failure, initial, isResult, isResult as isAsyncResult, success, TypeId }
```

Anti-pattern code smells to lint for:

- `export { <names> } from` where the target module is also imported by the same entry (clause-drop class).
- `@internal` JSDoc directly above an `export { ... }` statement that re-exports PUBLIC names (strip-class).

## Verification & Prevention

- Assert the shipped surface on every build: a strict-consumer compile (no source condition, no `skipLibCheck`) importing every documented public name. Tracked as pending gate in issue 177; until it lands, re-run the probe manually on any dts-adjacent change.
- When touching dts-affecting machinery, always emit into a clean, empty output directory and diff the entry export lists against the module's `export` statements — never trust an incremental cache (`clean: false` in tsdown config hides stale artifact errors).
- Namespace type members: keep the merge in one module and verify with a consumer compile that `Result.Success<R>` and `Result.Failure<R>` resolve — the old per-entry split dropped them silently.

## Related

- `docs/solutions/build-errors/exports-types-rollup-drift.md` — adjacent class: `exports.types` pointing at a rollup the build never produces (path drift vs name drop).
- Issue #177 — this repo's automated gate for the shipped dts named-export surface.
