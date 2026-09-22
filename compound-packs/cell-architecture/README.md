# Cell Architecture Compound Pack

Principles and design law for structuring systems with `@systemfsoftware/effect-cell-types` and Effect-TS.

## Core Tenet

Every interaction with the outside world is an authored unit called a **Cell**: a pure core enclosed by a typed imperative shell.

1. **Pure Decision Core (`*.workflow.ts`)**: Business logic is a total function constructed via `Workflow.make` with cyclomatic complexity 1. Branching is exhaustive dispatch over closed tagged unions (`Match.exhaustive`).
2. **The I/O Sandwich (`Sandwich.named`)**: External interactions chain sequential phases (`read` → `decode` → `decide` → `encode` → `write`) where the type system enforces lawful phase order and isolates side-effects to the outer bread.
3. **Algebraic Composition (`Cell.andThen`)**: Cells compose algebraically as first-class, lazy, pipeable values without sequential `yield* cell.run()` interleaving.
4. **Environment & Lifecycle Boundaries (`Effect.scoped`, `Cell.provide`)**: Services in `R` bind once at the application composition root. Ephemeral resource lifecycles acquire inside `Scope` with escalating finalizers.
5. **Staged Resource Algebras & Minimal Handles**: Cold declarative specifications require identity before exposing combinators and compile directly to scoped executions (`spec.scoped`) or parameterized layers (`spec.layer`), returning minimal protocol handles with encapsulated private driver slots.

---

## Rules in this Pack

| Rule                                                               | Title                       | Primary Invariant                                                                                            | Gate           |
| :----------------------------------------------------------------- | :-------------------------- | :----------------------------------------------------------------------------------------------------------- | :------------- |
| [`sandwich-phase-order.md`](sandwich-phase-order.md)               | Sandwich Phase Order        | Outside interactions follow the typed five-phase sandwich chain (`read → decode → decide → encode → write`)  | `type-checker` |
| [`pure-decision-workflows.md`](pure-decision-workflows.md)         | Pure Decision Workflows     | Decisions are total `Workflow.make` values with cyclomatic complexity 1 and exhaustive dispatch              | `type-checker` |
| [`four-channel-contracts.md`](four-channel-contracts.md)           | Four-Channel Contracts      | Channels (`I`, `A`, `E`, `R`) separate inputs, outcomes, typed errors with causes, and dependencies          | `type-checker` |
| [`pipeline-composition.md`](pipeline-composition.md)               | Pipeline Composition        | Cells compose algebraically via `Cell.andThen`, `Cell.zip`, and `Cell.gate`, never sequential `cell.run`     | `type-checker` |
| [`composition-root-binding.md`](composition-root-binding.md)       | Composition Root Binding    | Dependencies bind once at the composition root; libraries export parameterized `layer(spec)` constructors    | `type-checker` |
| [`ports-separate-from-layers.md`](ports-separate-from-layers.md)   | Ports Separate from Layers  | Capability tags (`Context.Service`) live in pure declaration modules separate from concrete `Layer` adapters | `lint`         |
| [`scoped-lifecycle-boundaries.md`](scoped-lifecycle-boundaries.md) | Scoped Lifecycle Boundaries | Resources acquire inside native Effect `Scope` with escalating finalizers; no imperative `start()`/`stop()`  | `type-checker` |
| [`staged-lawful-builders.md`](staged-lawful-builders.md)           | Staged Lawful Builders      | Mandatory identity required before exposing combinators and terminal execution handles                       | `type-checker` |
| [`resource-vs-handle-duality.md`](resource-vs-handle-duality.md)   | Resource vs Handle Duality  | Cold specifications compile to live Pipeable handles inside Scope, never ambient Context.Services            | `review`       |
| [`handle-state-privacy.md`](handle-state-privacy.md)               | Handle State Privacy        | Per-instance state travels inside the instance via symbol slots; module mutable registries are forbidden     | `review`       |
| [`pipeable-dual-parity.md`](pipeable-dual-parity.md)               | Pipeable Dual Parity        | Builders and combinators provide full parity between method chaining and data-last `pipe(...)`               | `review`       |
| [`single-namespace-barrel.md`](single-namespace-barrel.md)         | Single Namespace Barrel     | Domain abstractions export as single cohesive namespace barrels matching Effect lineage                      | `review`       |
| [`callable-vs-resource-syntax.md`](callable-vs-resource-syntax.md) | Callable vs Resource Syntax | Evaluators/workflows use callable syntax `fn(input)`; resources/entities use interface properties            | `review`       |
