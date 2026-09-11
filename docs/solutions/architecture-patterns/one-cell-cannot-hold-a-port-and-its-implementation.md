---
title: One cell cannot hold both a port and its implementation
date: 2026-08-15
category: architecture-patterns
module: port discipline and service keys
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - a file declares a service key and the Layer that provides it in the same module
  - a rule forbids a value edge into a file that holds two different things
  - deciding whether a constraint is sited in the rule or in the split
tags:
  - effect-ts
  - service-key
  - layer
  - import-edge
  - cell-taxonomy
  - enforcement-gap
---

# One Cell Cannot Hold Both A Port And Its Implementation

A capability port and the implementation that satisfies it are two different things with two
different consumers. When one module holds both, every rule governing the edge into it has to decide
for both at once — and the only safe file-level answer is to forbid the edge. That ban manufactures a
projection tag in every consumer.

## Why a file-level ban forces a projection

A port is only usable as a **value** — `yield* LeaderLock` needs the tag at runtime. Type-only is
therefore not a weaker form of the same access, it is a different thing: enough to name the
service's type, never enough to require it. A module forbidden a value edge into the module that
declares the port has exactly one route left, and it is forced rather than chosen: mint a local tag
whose service type references the port's type, and bridge the two with a layer whose body carries no
logic at all.

A prohibition that leaves exactly one legal route, with a workaround at the end of it, is worse than
no prohibition: it manufactures the workaround and then certifies it as the shape. The projections
were not a style that spread; they were the only shape the boundary rule left.

## What the primary does instead

Effect separates the port from its implementation across packages, so the edge alone decides which
of the two a consumer reached for. The port ships in `effect`; the implementation in
`@effect/platform-node-shared`:

```ts
// the port — package `effect`
export const FileSystem: Context.Service<FileSystem, FileSystem> = Context.Service('effect/platform/FileSystem')

// the implementation — package `@effect/platform-node-shared`
export const layer: Layer.Layer<FileSystem.FileSystem> = Layer.effect(FileSystem.FileSystem)(makeFileSystem)
```

A consumer value-imports `effect` freely; only a composition root reaches for
`@effect/platform-node-shared`. The discipline holds one level down as well — the Node
`ChildProcessSpawner` layer in the same package requires `FileSystem.FileSystem | Path.Path`, two
**ports**, never another implementation.

That separation is what makes a single rule sufficient. Depending on a port is correct and
depending on an implementation is not, and when the two live in different modules the edge alone
decides which happened. No projection is needed because nothing was ever out of reach.

## The correction

Split the cell rather than the rule. A port is a declaration — a tag and its service type — and
belongs in a cell any consumer may value-import. An implementation is a `Layer` and belongs where
only a composition root reaches it. An edge rule over the two then means what it was written to
mean: never depend on an implementation.

Two repairs that look adjacent and are not:

- **Making the rule symbol-aware** — permit the tag export, forbid the layer export from the same
  file. Sound only with type information, because the alternative is keying on the export's name
  (`*Live`, `layer`), and a name is the author's to change. It also leaves the conflation in place
  for every other consumer of that file.
- **Relaxing the edge rule** — this deletes the constraint instead of siting it. The runtime edge
  from a decision to a concrete implementation is real and worth forbidding; it is the port that
  was never the hazard.

## What a violation costs now

Nothing catches a module that value-imports an implementation, and nothing stops a module from
declaring a service key beside the `Layer` that provides it. That is why the split is the
load-bearing half. No gate keys on a cell-role filename any more; what selects the mutation
population now is the `Workflow.make` boundary. `collectMakeBoundaries` in
`@systemfsoftware/oxlint-make-boundary` (`packages/oxlint-plugin/make-boundary`) reads every `make`
call whose callee resolves to the `Workflow` value of `@systemfsoftware/effect-cell-types`, and the
`workflow-make-boundary` ignorer in `@systemfsoftware/stryker-plugins` takes the mutated set from
that same boundary: a mutant outside every `Workflow.make` body is not in the population at all.
With the split, the edge is visible in the import graph, so whatever instrument is pointed at that
graph has one thing to decide instead of two.
