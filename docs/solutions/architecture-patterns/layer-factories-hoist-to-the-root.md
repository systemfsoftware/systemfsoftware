# Solution: A layer factory parameterized by runtime values is the composition root hiding inside a helper

## Problem

The stryker CLI assembled its host layer per run: `makeRunLayer(env, events?)` was an engine export parameterized by runtime values, and the CLI threaded `(hostOptions, queue)` through a `defaultRunMutationTest` factory that rebuilt and re-provided the layer on every invocation. The architecture read as "provide once at the root" in prose while the code provided N times at N call sites — and the engine owned a factory whose only consumer was one CLI, coupling the host-neutral package to composition-root concerns.

## Failure mechanisms

1. **Parameter-threading masquerading as DI.** A layer built from function parameters is a constructor, not a composition root. The tell: the same `Effect.provide(layer(...))` expression appears at more than one run site, each rebuilding identical wiring.
2. **Service-as-parameter drift.** When a cell needs a value (a base path, a queue), threading it as a function parameter instead of seeding it with `Layer.succeed` forces every intermediate function to carry it and invites per-site re-provision.
3. **Redundant double-provide.** A layer that already succeeds a service plus an outer `Effect.provideService` of the same tag reads green and hides which provision wins.

## Architectural invariants

- **Runtime values enter context at the root via `Layer.succeed`, never as function parameters.** The composition root assembles one `AppLayer` (`Layer.mergeAll` of seeded values, static layers, and host layers — merged with `Layer.provideMerge` when a static layer requires ports), then `Cell.provide`s each cell once. What varies per invocation belongs in the command; what varies per process belongs in the seeded layer.
- **The engine exports static layers only.** A host-neutral package ships `Layer` constants (`idGeneratorLayer`), never `makeXLayer(args)` factories; factories are composition-root code and belong to the process entry.
- **Per-run resources close at run end via `Layer.scope` at the root.** The cell reaches the edge with `R` eliminated: the root provides `Layer.scope` alongside the host layers, so a `Scope` requirement is satisfied per run and closed when that run's effect completes — the same lifetime the bare `Effect.scoped` run used to carry, in the shape the run edge now requires.
- **Residue lint closes the loop.** `no-two-run-chain` (registered at error) makes the hand-sequenced shape fail a command when pasted back; the per-run-provision shape is refused by `Cell.run`'s signature itself — an unprovided cell does not compile at the edge.

## Verification

- Import sweep: the engine exports no function returning `Layer`; the CLI contains exactly one `Layer.mergeAll` assembly and its `Cell.run` sites are bare cells provided at the root.
- Grep: `Effect.provideService` piped directly onto a `Cell.run` returns zero hits in `packages/stryker-js/`; `makeRunLayer` has zero references.
- Paste-back: a scratch file containing the old chain fails `oxlint` with `no-two-run-chain` at error, and a scratch file running a cell with an inhabited `R` fails `tsc` with `UnprovidedCell`.
