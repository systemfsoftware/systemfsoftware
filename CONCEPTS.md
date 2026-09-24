# Concepts

Shared domain vocabulary for systemfsoftware — entities, architectural contracts, named processes, and verification mechanisms with precise repo meaning.

Glossary only, not a spec or catch-all. Every term defines what it is, its boundaries, and the deterministic gate that enforces it.

---

## Cell Architecture

### Cell

One five-phase sandwich chain that mediates between outside I/O and pure business decisions.
Compiled from a continuation chain:

1. `read` (impure, gathers input and state via services `R`, returns command `Encoded`)
2. `decode` (pure, library-derived via the workflow's command schema; failures route to `CommandRejected`)
3. `decide` (pure core, inside `Workflow.make`, CC = 1)
4. `encode` (pure, library-derived via decision and error schemas)
5. `write` (impure, exhaustive handler record over outcome tags plus `CommandRejected`)

A Cell is typed `Cell<in I, out A, out E = never, out R = never>` and exposes `run: (input: I) => Effect<A, E, R>`.
Only `read` and `write` handlers may access context services (`R`) or fail with infrastructure errors (`E`).

_Gate:_ Typecheck via `pnpm --filter @systemfsoftware/effect-cell-types typecheck` and lint via `@systemfsoftware/oxlint-plugin-cell-architecture`.

### Workflow

A pure decision function with cyclomatic complexity 1: typed command in, `Result<Decision, Error>` out. Zero I/O, zero services, zero ambient clocks or random generators.

Created exclusively via `Workflow.make({ command, decision, error, decide })`:

- `command`: An instrumented schema class carrying `static readonly [Workflow.InstrumentationBrand]`.
- `decision`: A schema declaring either an exclusive choice of `S.TaggedClass` variants sharing a single family `Symbol.for` brand, or a list of events (`Schema.Array(EventUnion)`).
- `error`: An `S.TaggedError` variant, a union of tagged errors, or `Schema.Never` if the decision cannot fail.
- `decide`: Total decision function ending in `Match.exhaustive` or `Match.orElse`.

The `WorkflowBrand` phantom type guarantees that only values produced by `Workflow.make` are accepted by `Sandwich.decide`.

_Gate:_ `@systemfsoftware/oxlint-plugin-dmmf-workflow` rules (`make-body-purity`, `make-command-schema`, `workflow-match-exhaustive`).

### Decision Family Brand

A unique `Symbol.for` token declared at module scope and assigned to each decision variant class as `readonly [TypeId] = TypeId`. Enforces at compile time that variants belong to the same logical decision family. Prevents variant leakage across workflow boundaries (`UnsharedTypeId`).

_Gate:_ Compiler rejection (`UnsharedTypeId`) in `@systemfsoftware/effect-cell-types`.

### Sandwich

The lawful stage builder constructor (`Sandwich.named(name)`) enforcing the 5-phase sequencing at compile time:
`Sandwich.named(name)(readFn).decide(workflow).write(handlers)`
Phases cannot be reordered or skipped. Handlers in `write` must be exhaustive over all encoded decision variants, domain error variants, and `CommandRejected`.

_Gate:_ TypeScript compiler checks on stage builder method chains and exhaustive handler record parameters.

### CommandRejected

The system error generated automatically in Phase 2 (`decode`) when raw input from `read` fails schema validation against the workflow's command schema. Handled explicitly in Phase 5 (`write`) without invoking `decide`.

_Gate:_ Compiler failure if `CommandRejected` is missing from `Sandwich.write({ ... })`.

### Resource

A cell kind: an inert, schema-declared spec for an external target, plus projections of one scoped acquisition (`scoped`, `layer`, `bind(key)`). Declared with `Resource.make({ spec, handle, prepare?, ready? })` in a `*.resource.ts` file. `prepare` turns the spec into the handle's create input before the driver exists; `ready` receives the acquired handle. Configuration is dual-only.

_Gate:_ `Resource.make` type refusals (`pnpm --filter @systemfsoftware/effect-cell-types test:types`) and `@systemfsoftware/oxlint-plugin-cell-architecture` rules `kind-file-construction`, `kind-construction-location`, `kind-file-declares-no-service`, and `kind-file-holds-no-module-state`.

### Handle

A cell kind: branded, pipeable data for a live instance, whose third-party driver sits in a slot only the handle's own definition reads. Declared with `Handle.make` in a `*.handle.ts` file. Acquisition registers the release in the caller's `Scope` in the same step; the release is a list of escalating stages whose unrecovered failure surfaces as a defect; an operation run after release dies with `HandleReleased`. Operations, streams, and child handles are duals the kind builds. A driver method whose own result controls the driver is unenforced guidance.

_Gate:_ `Handle.make` type refusals and lifecycle scenarios (`pnpm --filter @systemfsoftware/effect-cell-types test:types` and `test`) and `@systemfsoftware/oxlint-plugin-cell-architecture` rules `handle-driver-confinement`, `handle-imports-no-resource`, and `cell-file-owns-no-lifecycle`.

### Grain Table

The three-way classification of operations by their relationship to service requirements (`R`):

1. **Wiring closure**: Eliminates `R` at the application composition root (`main.ts`) once via `Cell.provideContext(context)`. Never performed mid-pipeline or inside domain cells.
2. **Interpretation**: Executes the fiber at the outside boundary (`runtime.runPromise`, `NodeRuntime.runMain`). Requires $R = \text{never}$.
3. **Work**: Maintains `R` open as cell arrows compose (`andThen`, `zip`, `flatMap`, `map`).

_Gate:_ `review` — verified by code review that `Cell.provideContext` and `Effect.provide` do not appear inside domain cells or workflow modules.

---

## Boundary Testing & System Oracles

### Boundary Adapter

Code that translates between in-memory Effect workflows and external wire protocols, databases, or operating system resources.

_Gate:_ `@systemfsoftware/oxlint-plugin-test-discipline` rules.

### Local System Oracle

A real, disposable local operating system resource used to verify boundary adapters without mocks:

- Loopback TCP listeners on ephemeral ports (`127.0.0.1:0`)
- Temporary directories and files (`memfs` or real tmpdirs)
- Embedded in-process engines (`@electric-sql/pglite`, sqlite in-memory)
- Real child processes

Mocks of platform drivers (`net`, `fs`, `child_process`, `sql`) are prohibited by architectural doctrine and Oxlint rules.

_Gate:_ `@systemfsoftware/oxlint-plugin-test-discipline(no-driver-mocks)` AST lint check.

### Dual-Condition Check

A boundary verification requirement: every boundary adapter test must assert both acceptance (active server responds correctly) and immediate refusal (closed socket or unavailable path refuses without hanging or leaking descriptors).

_Gate:_ `review` — verified in test suites for network and process boundaries.

### Differential Test

A test that runs two implementations on the same generated input and accepts only when a relational oracle holds or both sides fail identically, proving parity without a hardcoded expected value. Lives in a `tests/*.differential.test.ts` file.

_Gate:_ `@systemfsoftware/oxlint-plugin-test-discipline(differential-test-requires-harness)` — the file must import and invoke the differential harness.

### Metamorphic Relation

A property relating a system's own output on a seed input to its output on a transformed follow-up input, checked without any expected output value; the input transformation replaces the oracle's second implementation.

_Gate:_ expressed through the same harness and supervisor as a Differential Test.

---

## Schema & Property Law

### Generated Schema Law

Bidirectional identity and encoding stability laws automatically derived for exported schemas via `@systemfsoftware/effect-schema-law` and `@systemfsoftware/effect-schema-vite`:

1. `decode(encode(valid)) === valid`
2. `encode(decode(wire)) === wire`

Derived from the schema's own arbitrary generators.

_Gate:_ `pnpm --filter <pkg> test` running inline schema law property suites.

### Recursion Budget

A declared limit on recursive schemas (`Schema.suspend`) defining maximum depth (`maxDepth`) and decay shape (`depthSize`) enforced by `@systemfsoftware/effect-schema-recursion-budget`. Prevents stack overflows and generator hangs during property-based testing.

_Gate:_ `pnpm --filter @systemfsoftware/effect-schema-recursion-budget test`.

### Residual Filter

A refinement filter where arbitrary test data is produced via rejection sampling rather than constructive generation. Explicitly annotated with `arbitrary: { residual: true }` to satisfy the `@systemfsoftware/oxlint-plugin-effect-schema` checks.

_Gate:_ `@systemfsoftware/oxlint-plugin-effect-schema(schema-filter-constructive-generation)` lint check.

---

## Workspace & Build Pipeline

### `@systemfsoftware/source` Export Condition

A custom `exports` subpath condition declared by tsdown that maps imports directly to TypeScript source (`./src/*.ts`) during local development and testing. Enables immediate type checking and test execution without intermediate compilation. Stripped from published package manifests.

_Gate:_ `node scripts/tools/pack-all.mjs` verifying clean publishConfig exports.

### Evaluator Surface

A file or script whose sole purpose is to evaluate or gate other code (CI workflows, linter rules, test-discipline plugins, changeset checks).
_Rule:_ An Evaluator surface must always be modified in its own isolated commit, never bundled with the code it judges.

_Gate:_ `review` and commit-message inspection in CI.

### Drift Gate

An automated check that re-runs code generation or schema derivation and asserts zero git diff against committed artifacts. Guarantees that generated documentation, API declarations, and bindings never diverge from source code.

_Gate:_ `git status --short` clean check in CI workflows following build/api-extractor steps.

### Input-Hash Completeness

The property of a build cache key where every file, environment variable, tool binary, and dependency capable of influencing output is captured. An incomplete key allows silent stale passes.

_Gate:_ Turbo task cache configuration in `turbo.json`.

---

## Release Pipeline

### Intent Versioning

The pnpm-native release model where semantic version changes are authored as intent files in `.changeset/*.md`. Consumed during release workflows by `pnpm version -r` to update `package.json` files and generate changelogs.

_Gate:_ `.github/workflows/changeset-check.yml` executing `scripts/guards/check-changeset.ts`.

### Release Set

The exact set of non-private workspace packages whose current version has not yet been published to the npm registry. Computed dynamically by probing the registry before publishing.

_Gate:_ `scripts/tools/publish-set.ts` run during CI release dispatch.
