# One Cell Cannot Hold Both A Port And Its Implementation

A capability port and the implementation that satisfies it are two different things with two
different consumers. An `.adapter` cell holds both, so every rule that governs the edge into it
has to decide for both at once — and the only safe file-level answer is to forbid the edge. That
ban is what manufactures a projection tag in every consumer.

## The chain, measured

`cell-import-boundary` gives `.executor.ts` the edge `forbidValue: ['.adapter']`
(`packages/oxlint-plugins/cell-imports/src/cell-import-table.config.ts`), and reports:

> `../leader-lock.adapter.js` is forbidden. Expected: at most a type-only reference to this cell.
> Actual: a value import of the .adapter cell. Fix: use `import type` so no runtime edge is created.

A port is only usable as a **value** — `yield* LeaderLock` needs the tag at runtime. Type-only is
therefore not a weaker form of the same access, it is a different thing: enough to name the
service's type, never enough to require it. An executor obeying the rule has exactly one route
left, and it is forced rather than chosen:

```ts
// the adapter is reachable for its type and nothing else, so the executor mints its own tag
export class WithLeaderLockExecutorDeps extends Context.Tag('…/WithLeaderLockExecutorDeps')<
  WithLeaderLockExecutorDeps,
  { readonly withLock: LeaderLock['Type']['withLock'] } // a type-only reference to the port
>() {}
```

Something else then has to bridge the two, and that something is a layer whose body carries no
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

Measured across the tree: **25 production `*ExecutorDeps` tags**. Against the two categories that
license managing a dependency at all, **3** had a second implementation, **3** were substituted in
a test, and **22** had neither — 4 of them had no `Layer` constructing them anywhere. The
projections are not a style that spread; they are the only shape the boundary rule leaves.

## What the primary does instead

Effect separates the port from its implementation across packages, and puts the implementation
behind an `internal/` path:

| Thing              | Where                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the port           | `repos/effect/packages/platform/src/FileSystem.ts:460` — `export const FileSystem: Tag<FileSystem, FileSystem> = internal.tag`                           |
| the implementation | `repos/effect/packages/platform-node-shared/src/internal/fileSystem.ts:648` — `export const layer = Layer.effect(FileSystem.FileSystem, makeFileSystem)` |

A consumer value-imports `@effect/platform` freely; only a composition root reaches for
`@effect/platform-node`. The discipline holds one level down as well —
`platform-node-shared/src/internal/commandExecutor.ts:247` builds the node `CommandExecutor` and
its own requirement is `FileSystem.FileSystem`, another **port**, never another implementation.

That separation is what makes a single rule sufficient. Depending on a port is correct and
depending on an implementation is not, and when the two live in different modules the edge alone
decides which happened. No projection is needed because nothing was ever out of reach.

## The correction

Split the cell rather than the rule. A port is a declaration — a tag and its service type — and
belongs in a cell any consumer may value-import. An implementation is a `Layer` and belongs where
only a composition root reaches it. `forbidValue` then means what it was written to mean: never
depend on an implementation.

Two repairs that look adjacent and are not:

- **Making the rule symbol-aware** — permit the tag export, forbid the layer export from the same
  file. Sound only with type information, because the alternative is keying on the export's name
  (`*Live`, `layer`), and a name is the author's to change. It also leaves the conflation in place
  for every other consumer of that file.
- **Relaxing `forbidValue`** — this deletes the constraint instead of siting it. The runtime edge
  from a decision to a concrete implementation is real and worth forbidding; it is the port that
  was never the hazard.

## What a violation costs now

Nothing catches an executor that value-imports an implementation once `forbidValue` is relaxed
without the split, which is why the split is the load-bearing half. With the split, the edge is
visible in the import graph and the existing rule decides it — the same instrument, finally
pointed at the thing it was written for.
