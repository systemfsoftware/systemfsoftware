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
different consumers. A `.adapter` cell held both, so every rule that governed the edge into it had
to decide for both at once — and the only safe file-level answer was to forbid the edge. That ban
manufactured a projection tag in every consumer. The rule and the fleet around it were deleted on
2026-08-16: `cell-imports` is gone with the `cell-import-boundary` rule it shipped and the
`forbidValue` edges that rule read, no `.adapter` or `.executor` file remains anywhere in the tree,
and no `*ExecutorDeps` tag is importable. What survives is the lesson and the measurement that
carried it.

## The chain, measured

The deleted `cell-import-boundary` rule, last shipped in the deleted `cell-imports` package, gave
`.executor.ts` the edge `forbidValue: ['.adapter']` over a table in `cell-import-table.config.ts`,
and reported:

> `../leader-lock.adapter.js` is forbidden. Expected: at most a type-only reference to this cell.
> Actual: a value import of the .adapter cell. Fix: use `import type` so no runtime edge is created.

A port is only usable as a **value** — `yield* LeaderLock` needs the tag at runtime. Type-only is
therefore not a weaker form of the same access, it is a different thing: enough to name the
service's type, never enough to require it. An executor obeying the rule had exactly one route
left, and it was forced rather than chosen:

```ts
// the adapter is reachable for its type and nothing else, so the executor mints its own tag
export class WithLeaderLockExecutorDeps extends Context.Tag('…/WithLeaderLockExecutorDeps')<
  WithLeaderLockExecutorDeps,
  { readonly withLock: LeaderLock['Type']['withLock'] } // a type-only reference to the port
>() {}
```

Something else then had to bridge the two, and that something was a layer whose body carries no
logic at all:

```ts
export const WithLeaderLockExecutorLive: Layer.Layer<WithLeaderLockExecutorDeps, never, LeaderLock> = Layer.effect(
  WithLeaderLockExecutorDeps,
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    return { withLock: lock.withLock }
  }),
)
```

Those fences show the shape the rule manufactured, not one that ships. Measured across the tree
while it was live — a census of every production `*ExecutorDeps` tag — the count was **25**. Against
the two categories that license managing a dependency at all, **3** had a second implementation,
**3** were substituted in a test, and **22** had neither — 4 of them had no `Layer` constructing
them anywhere. The three category counts sum to 28 against a population of 25, so a tag can sit in
two categories at once; the population is the figure to trust. The projections were not a style
that spread; they were the only shape the boundary rule left — and a prohibition that leaves
exactly one legal route, with a workaround at the end of it, is worse than no prohibition: it
manufactures the workaround and then certifies it as the shape.

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

Nothing catches a module that value-imports an implementation once the rule is gone, and nothing
stops a module from declaring a service key beside the `Layer` that provides it — the deletion took
the rule and left the conflation. That is why the split is the load-bearing half. No gate keys on a
cell-role filename any more; what selects the mutation population now is the `Workflow.make`
boundary. `collectMakeBoundaries` in
`@systemfsoftware/oxlint-make-boundary` (`packages/oxlint-plugin/make-boundary`) reads every `make`
call whose callee resolves to the `Workflow` value of `@systemfsoftware/effect-cell-types`, and the
`workflow-make-boundary` ignorer in `@systemfsoftware/stryker-plugins` takes the mutated set from
that same boundary: a mutant outside every `Workflow.make` body is not in the population at all.
With the split, the edge is visible in the import graph, so whatever instrument is pointed at that
graph has one thing to decide instead of two.
