# Resource Algebra Compound Pack

This pack codifies the architectural laws for **Capability & Infrastructure Tooling Packages** in Effect-TS (container drivers, client libraries, sandboxes, process supervisors, and external resource brokers).

## Domain Scope

Business applications follow **Hexagonal / Clean Architecture** (codified in `compound-packs/cell-architecture`): pure domain cores define abstract capability ports (`Context.Service`), while infrastructure adapters supply application-side `*Live` layers at `main.ts`.

However, capability packages **are themselves the engine**. Forcing a library package to invent dummy `Context.Service` tags and export static `Live` singletons creates artificial ceremony, forces consumers to resolve dummy services from context, and conflates application assembly with library design.

This pack defines **Executable Resource Algebras**: pure declarative specifications that compile directly into native Effect `Scope`-managed acquisitions and parameterized `Layer` constructors.

## Rules in this Pack

| Rule                                  | Title                            | Primary Invariant                                                                                   | Gate           |
| :------------------------------------ | :------------------------------- | :-------------------------------------------------------------------------------------------------- | :------------- |
| `staged-lawful-builders.md`           | Staged Lawful Builders           | Mandatory identity required before exposing combinators and execution handles                       | `type-checker` |
| `pipeable-dual-parity.md`             | Pipeable Dual Parity             | Full parity between fluent method chaining and data-last `pipe(...)` composition                    | `review`       |
| `scoped-lifecycle-first.md`           | Scoped Lifecycle First           | Resources acquire inside Effect `Scope` with escalating finalizers; no imperative start/stop        | `review`       |
| `parameterized-layer-constructors.md` | Parameterized Layer Constructors | Libraries export parameterized `layer(spec)` constructors, never static `*Live` singletons          | `review`       |
| `single-namespace-barrel.md`          | Single Namespace Barrel          | Primary abstractions export as single cohesive namespace barrels matching Effect lineage            | `review`       |
| `callable-vs-resource-syntax.md`      | Callable vs Resource Syntax      | Evaluators/policies use callable syntax `fn(input)`; resources/entities use interface properties    | `review`       |
| `error-channel-causes.md`             | Error Channel Causes             | Errors wrap underlying failures via `cause: Schema.optional(Schema.Unknown)`, never string `reason` | `review`       |
| `internal-engine-boundary.md`         | Internal Engine Boundary         | Cell sandwiches and workflows drive execution without leaking port ceremony to consumers            | `type-checker` |
