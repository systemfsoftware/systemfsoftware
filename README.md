# systemfsoftware

> Pure-core / imperative-shell architecture, type-level contracts, and deterministic verification gates for production Effect-TS systems.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![CI Status](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/release.yml?branch=main&style=flat-square&label=CI)](https://github.com/systemfsoftware/systemfsoftware/actions)

Large language models generate code with subtle integration traps: mocks on internal glue that pass without testing real drivers, procedural branching that conceals untested code paths, and prose rules that are ignored when context windows compact.

**systemfsoftware** provides an architecture and verification toolchain designed to make illegal programs unrepresentable and prevent regressions at compile time and in CI:

1. **Cell architecture**: Outside interactions follow a typed, five-phase sandwich chain (`read -> decode -> decide -> encode -> write`).
2. **Pure decision workflows**: Business logic executes in pure functions with cyclomatic complexity 1. Branching uses exhaustive pattern matching over closed variant types.
3. **Boundary testing**: Adapters are verified against real local system oracles (loopback sockets, temporary directories, child processes), not driver mocks.
4. **Automated gates**: Architectural contracts are enforced by the TypeScript compiler, Oxlint AST rules, property-test generators, and Stryker mutation testing.

```text
                                  Input `I`
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cell<in I, out A, out E, out R>                                            │
│                                                                             │
│   1. Read       (Impure: (input: I) => Effect<Encoded<Cmd>, RE, RR>)        │
│         │                                                                   │
│         ▼                                                                   │
│   2. Decode     (Pure: Schema.decodeUnknown(CommandSchema))                 │
│         │                                    │                              │
│      [valid]                             [invalid]                          │
│         │                                    │                              │
│         ▼                                    ▼                              │
│   3. Decide     (Pure: Workflow.make)    5b. Write: CommandRejected handler │
│         │                                            │                      │
│      [Result]                                        │                      │
│         │                                            │                      │
│         ▼                                            │                      │
│   4. Encode     (Pure: variant schemas)              │                      │
│         │                                            │                      │
│         ▼                                            │                      │
│   5a. Write     (Impure: Tag-keyed handlers)         │                      │
│         │                                            │                      │
└─────────┼────────────────────────────────────────────┼──────────────────────┘
          ▼                                            ▼
   Handler Response (`A`)              Infrastructure Error (`RE | WE` in `E`)
```

## Quick Start

Install the cell runtime and peer dependencies:

```bash
pnpm add @systemfsoftware/effect-cell-types effect@4.0.0-rc.116
```

### 1. Declare the Pure Decision Workflow

Workflows have cyclomatic complexity 1 and declare schemas for commands, decisions, and domain errors. Decision variants share a family brand (`Symbol.for`), and command schemas declare their instrumentation mapping:

```ts
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

// Family brand distinguishing this decision's variants
const AllocationTypeId: unique symbol = Symbol.for('inventory/Allocation')
type AllocationTypeId = typeof AllocationTypeId

export class AllocateStockCommand extends S.Class<AllocateStockCommand>('AllocateStockCommand')({
  orderId: S.String,
  requestedQuantity: S.Int.pipe(S.check(S.isGreaterThan(0))),
  availableQuantity: S.Int.pipe(S.check(S.isGreaterThanOrEqualTo(0))),
}) {
  static readonly [Workflow.InstrumentationBrand] = { orderId: 'app.order.id' } as const
}

export class StockAllocated extends S.TaggedClass<StockAllocated>()('StockAllocated', {
  orderId: S.String,
  quantity: S.Int,
}) {
  readonly [AllocationTypeId] = AllocationTypeId
}

export class InsufficientStockRefusal extends S.TaggedError<InsufficientStockRefusal>()('InsufficientStockRefusal', {
  orderId: S.String,
  deficit: S.Int,
}) {
  readonly [AllocationTypeId] = AllocationTypeId
}

export const allocateStockWorkflow = Workflow.make({
  command: AllocateStockCommand,
  decision: StockAllocated,
  error: InsufficientStockRefusal,
  decide: (cmd) =>
    Match.value(cmd.availableQuantity >= cmd.requestedQuantity).pipe(
      Match.when(true, () =>
        Result.succeed(
          new StockAllocated({
            orderId: cmd.orderId,
            quantity: cmd.requestedQuantity,
          }),
        )),
      Match.when(false, () =>
        Result.fail(
          new InsufficientStockRefusal({
            orderId: cmd.orderId,
            deficit: cmd.requestedQuantity - cmd.availableQuantity,
          }),
        )),
      Match.exhaustive,
    ),
})
```

### 2. Wrap in a Five-Phase Cell Sandwich

The cell reads state, decodes the command via schema, executes the workflow, serializes the outcome, and calls the appropriate write handler:

```ts
import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Context, Effect } from 'effect'
import { allocateStockWorkflow } from './allocate-stock.workflow.js'

export class InventoryStore extends Context.Service<InventoryStore, {
  readonly getAvailableStock: (sku: string) => Effect.Effect<{ readonly quantity: number }>
  readonly commitAllocation: (orderId: string, quantity: number) => Effect.Effect<void>
}>()('InventoryStore') {}

export interface OrderRequest {
  readonly orderId: string
  readonly sku: string
  readonly requestedQuantity: number
}

export const allocateStockCell = Sandwich.named('inventory.allocate')(
  // Phase 1: Read (impure) -> returns Command's Encoded shape
  (req: OrderRequest) =>
    Effect.gen(function*() {
      const inventory = yield* InventoryStore
      const stock = yield* inventory.getAvailableStock(req.sku)
      return {
        orderId: req.orderId,
        requestedQuantity: req.requestedQuantity,
        availableQuantity: stock.quantity,
      }
    }),
)
  // Phase 2 (Decode) & Phase 4 (Encode) are derived automatically from schemas
  // Phase 3: Decide (pure workflow)
  .decide(allocateStockWorkflow)
  // Phase 5: Write (impure) -> exhaustive handlers over outcomes plus CommandRejected
  .write({
    StockAllocated: ({ orderId, quantity }) =>
      Effect.gen(function*() {
        const inventory = yield* InventoryStore
        yield* inventory.commitAllocation(orderId, quantity)
        return { status: 'allocated' as const, orderId, quantity }
      }),
    InsufficientStockRefusal: ({ orderId, deficit }) =>
      Effect.succeed({ status: 'refused' as const, orderId, deficit }),
    CommandRejected: ({ issue }) => Effect.fail(new Error(`Validation failed: ${issue}`)),
  })
```

### 3. Bind Services at the Composition Root

Provide context once at the entrypoint before invoking `.run()`:

```ts
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Layer } from 'effect'
import { allocateStockCell, InventoryStore } from './allocate-stock.cell.js'

const InventoryLive = Layer.succeed(InventoryStore, {
  getAvailableStock: (_sku) => Effect.succeed({ quantity: 10 }),
  commitAllocation: (_orderId, _qty) => Effect.void,
})

const program = Effect.gen(function*() {
  const context = yield* Layer.build(InventoryLive)
  const cell = Cell.provideContext(allocateStockCell, context)

  const result = yield* cell.run({
    orderId: 'ord-123',
    sku: 'widget-a',
    requestedQuantity: 2,
  })

  return result
})
```

---

## Architectural Doctrine

The principles and design laws governing code in this repository live in standalone Compound Engineering packs:

- [Cell Architecture](compound-packs/cell-architecture): Five-phase continuation chains, pure decision workflows, service and layer boundaries, four-channel separation, and scoped resource lifecycles.
- [Boundary Testing](compound-packs/boundary-testing): Local system oracles, zero driver mocks on internal glue, and dual-condition acceptance/refusal tests.

Concepts, definitions, and verification gates are indexed in [CONCEPTS.md](CONCEPTS.md).

---

## Monorepo Workspace Map

Run `pnpm map` to inspect packages, directories, and verified build gates:

```bash
pnpm map
```

### Core Architecture & Execution

| Package                                                                 | Purpose                                                                         | Verification Gates                                        |
| :---------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------- |
| [`@systemfsoftware/effect-cell-types`](packages/effect-cell-types)      | Type contracts for five-phase cells, stage builders (`Sandwich`), and workflows | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-readiness`](packages/effect-readiness)        | Pure readiness verification workflows and polling probe policies                | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-microsandbox`](packages/effect-microsandbox)  | Declarative container specifications and isolated microVM testcontainers        | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-daemon-spec`](packages/effect-daemon-spec)    | Supervision tree daemon primitives and health monitors                          | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-memfs`](packages/effect-memfs)                | In-memory Effect Platform `FileSystem` implementation                           | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-atom`](packages/atom/effect-atom)             | Reactive atomic state management with Effect streams                            | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-atom-react`](packages/atom/effect-atom-react) | React bindings and hooks for Effect Atom                                        | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |

### Schema & Property Law

| Package                                                                                      | Purpose                                                                      | Verification Gates                                        |
| :------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :-------------------------------------------------------- |
| [`@systemfsoftware/effect-schema-law`](packages/effect-schema-law)                           | Property-test generators for schema roundtrip laws and canonical subsets     | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-vite`](packages/effect-schema-vite)                         | Vite plugin discovering schemas and synthesizing inline property test suites | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-discovery`](packages/effect-schema-discovery)               | AST scanner finding exported schema declarations across workspace packages   | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-extensions`](packages/effect-schema-extensions)             | Common schema combinators, branded types, and transformations                | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-recursion-budget`](packages/effect-schema-recursion-budget) | Recursion depth ceilings and decay guards for recursive schemas              | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/hex-schema`](packages/hex-schema)                                         | Validated hex-encoded string and buffer codecs                               | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |

### Specification & BDD Verification

| Package                                                                | Purpose                                                                         | Verification Gates                                        |
| :--------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------- |
| [`@systemfsoftware/effect-gherkin-spec`](packages/effect-gherkin-spec) | Gherkin BDD syntax executing Given/When/Then steps as typed Effect workflows    | `build`, `lint`, `typecheck`, `test`, `attw`              |
| [`@systemfsoftware/storybook-gherkin`](packages/storybook-gherkin)     | Gherkin scenarios executed as play functions in Storybook browser tests         | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/differential-spec`](packages/differential-spec)     | Differential testing comparing candidate code against reference implementations | `build`, `lint`, `typecheck`, `test`                      |
| [`@systemfsoftware/effect-spec-runtime`](packages/effect-spec-runtime) | Test execution runtime and fixture isolation harness                            | `build`, `lint`, `typecheck`, `test`, `attw`              |
| [`@systemfsoftware/trace-spec`](packages/trace-spec)                   | OpenTelemetry trace assertion and contract specification harness                | `build`, `lint`, `typecheck`, `test`, `attw`              |
| [`@systemfsoftware/trace-taxonomy`](packages/trace-taxonomy)           | Semantic convention taxonomy and span attribute typings                         | `build`, `lint`, `typecheck`, `test`, `attw`              |

### Oxlint Static Plugins & Presets

| Package                                                                                                       | Purpose                                                                   | Verification Gates                                        |
| :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------ | :-------------------------------------------------------- |
| [`@systemfsoftware/oxlint-plugin-cell-architecture`](packages/oxlint-plugin/oxlint-plugin-cell-architecture)  | Enforces sandwich phase sequencing and inward dependency direction        | `build`, `lint`, `typecheck`, `test`, `api:check`         |
| [`@systemfsoftware/oxlint-plugin-dmmf-workflow`](packages/oxlint-plugin/oxlint-plugin-dmmf-workflow)          | Enforces workflow purity, CC = 1, and Match.exhaustive in `*.workflow.ts` | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/oxlint-plugin-effect-platform`](packages/oxlint-plugin/oxlint-plugin-effect-platform)      | Validates Effect Platform service usage and resource scopes               | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/oxlint-plugin-effect-schema`](packages/oxlint-plugin/oxlint-plugin-effect-schema)          | Flags schema decoding anti-patterns and unvalidated type assertions       | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/oxlint-plugin-test-discipline`](packages/oxlint-plugin/oxlint-plugin-test-discipline)      | Bans driver mocks on internal glue and enforces local system oracles      | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/oxlint-config-recommended`](packages/oxlint-presets/oxlint-config-recommended)             | Monorepo recommended linter configuration preset                          | `build`, `lint`, `typecheck`, `attw`                      |
| [`@systemfsoftware/oxlint-config-cell-architecture`](packages/oxlint-presets/oxlint-config-cell-architecture) | Linter preset enforcing pure-core/imperative-shell boundaries             | `build`, `lint`, `typecheck`, `attw`                      |
| [`@systemfsoftware/oxlint-config-dmmf`](packages/oxlint-presets/oxlint-config-dmmf)                           | Linter preset enforcing workflow purity and schema boundaries             | `build`, `lint`, `typecheck`, `attw`                      |
| [`@systemfsoftware/oxlint-config-rule-authoring`](packages/oxlint-presets/oxlint-config-rule-authoring)       | Linter preset for AST plugin authoring                                    | `build`, `lint`, `typecheck`, `attw`                      |

---

## Roadmap: Non-Autoregressive Decisions (Jev)

Our strategy (`STRATEGY.md`) establishes a boundary: **No LLM-as-judge review products.** Gates must be executable programs that fail commands, not models generating opinions.

Certain decisions cannot be resolved by AST linting alone:

- Did a code diff introduce a breaking semantic change to a public API?
- Does a refactor increase regression risk?
- How should an un-typed incoming payload route across internal handlers?

To handle these questions without conversational prompts, our roadmap integrates **System One Decision Models** — specifically TypeSafe's **Jev** model via Effect v4's `Decision` and `DecisionModel` modules (`effect/unstable/ai/Decision`):

```text
Conversational LLM:
  Diff ──► [ Prompt ] ──► "Looks good to me" (Uncalibrated, non-reproducible)

System One Decision Gate:
  Diff ──► [ Jev DecisionModel ] ──► P(regression) = 0.84, Label = "breaking" (~35ms forward pass)
                 │
                 ▼
  Tri-State Evaluation:
  • >= 0.80   ──► Reject PR / require migration
  • <= 0.50   ──► Pass
  • 0.50–0.80 ──► Mark uncertain (route to human reviewer)
```

1. **Non-autoregressive forward passes**: Jev evaluates questions (classification, probability, rating) in a single ~35ms forward pass without token streaming.
2. **Three-valued logic**: Decisions produce one of three outcomes: `Match` ($\ge 0.80$), `Miss` ($\le 0.50$), or `Uncertain` ($0.50 - 0.80$). Unhandled uncertainty fails the gate instead of rounding down to false.
3. **Mutation analysis**: Integration with Stryker to predict surviving mutants and calculate test contribution scores.

---

## Reference Implementation

A full-stack reference application demonstrating the cell architecture lives in [`examples/inventory-fulfillment/`](examples/inventory-fulfillment):

- **Transport**: Effect RPC over HTTP router (`effect/unstable/rpc`).
- **Persistence**: Drizzle ORM over embedded PGlite in tests and PostgreSQL in production.
- **Authentication**: Better-Auth session validation middleware.
- **Concurrency**: CAS optimistic concurrency retry loops isolated to Phase 5 (`write`).
- **Integration testing**: Sociable scenarios run against embedded PostgreSQL with zero mocks.

Run the example test suite:

```bash
pnpm --filter @systemfsoftware/example-inventory-fulfillment test
```

---

## Contributing

Review [CONTRIBUTING.md](CONTRIBUTING.md) for local environment setup, Nix flakes, and commit conventions.

Pre-delivery check command:

```bash
pnpm check:local
```

---

## License

Distributed under the [Apache 2.0 License](LICENSE).
