# systemfsoftware

> TypeScript architecture, type-level contracts, and verification gates for production Effect-TS systems.
>
> Rules in this repository are enforced by the TypeScript compiler, custom Oxlint rules, and mutation testing. If a behavior can regress without a test or a check failing, it does not ship.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![CI Status](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/release.yml?branch=main&style=flat-square&label=CI)](https://github.com/systemfsoftware/systemfsoftware/actions)

LLMs generate code with subtle failure modes: stubs on internal glue that pass without testing real behavior, branching that hides untested paths, and circular reviews where models approve their own patterns.

**systemfsoftware** provides an architecture and verification toolchain that prevents these defects at compile time and in CI:

1. **Cell architecture**: Every outside interaction follows a typed five-phase chain (`read -> decode -> decide -> encode -> write`).
2. **Pure workflows**: Business logic runs in pure functions with cyclomatic complexity 1. Branching uses exhaustive pattern matching over closed variant types.
3. **Boundary testing**: Boundary code is tested against real local OS resources (loopback sockets, temporary directories, child processes), not mock objects.
4. **Automated gates**: Architectural rules are enforced by compiler types, Oxlint AST plugins, property-test generators, and Stryker mutation testing.

```text
                  Outside World (HTTP / RPC / Message / DB)
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Cell Sandwich: Cell<in I, out A, out E, out R>                        │
│                                                                        │
│   1. Read       (Impure I/O: acquire state, snapshots, clocks via R)   │
│         │                                                              │
│         ▼                                                              │
│   2. Decode     (Pure: Schema.decodeUnknown into validated Command)    │
│         │                                                              │
│         ▼                                                              │
│   3. Decide     (Pure Core: Workflow.make, CC = 1, Match.exhaustive)   │
│         │                                                              │
│         ▼                                                              │
│   4. Encode     (Pure: Decision outcome mapped to wire payload)        │
│         │                                                              │
│         ▼                                                              │
│   5. Write      (Impure I/O: commit events, CAS transaction via R)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
                   Domain Outcome (A) or Failure (E)
```

---

## Contents

- [Core Principles](#core-principles)
- [Cell Architecture](#cell-architecture)
  - [The Five-Phase Sandwich Chain](#the-five-phase-sandwich-chain)
  - [Pure Decision Workflows (CC = 1)](#pure-decision-workflows-cc--1)
  - [The Four-Channel Contract](#the-four-channel-contract)
  - [Separating Ports from Layers](#separating-ports-from-layers)
  - [Resource & Lifecycle Algebra](#resource--lifecycle-algebra)
- [Boundary Testing & Local Oracles](#boundary-testing--local-oracles)
  - [No Mocks on Internal Glue](#no-mocks-on-internal-glue)
  - [Local System Oracles](#local-system-oracles)
- [Monorepo Package Map](#monorepo-package-map)
  - [Cell & Workflow Core](#cell--workflow-core)
  - [Schema & Property Law](#schema--property-law)
  - [Specification & BDD Verification](#specification--bdd-verification)
  - [Oxlint Static Rules](#oxlint-static-rules)
  - [Infrastructure & Tooling](#infrastructure--tooling)
- [Architectural Compound Packs](#architectural-compound-packs)
- [Roadmap: Non-Autoregressive Decisions (Jev)](#roadmap-non-autoregressive-decisions-jev)
- [Example Application: Inventory Fulfillment](#example-application-inventory-fulfillment)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

---

## Core Principles

When AI agents author code, three patterns cause silent regressions:

1. **Mocks hide driver bugs**: Stubs for network sockets, database queries, and filesystem operations pass without verifying real wire protocols or OS permissions.
2. **Procedural branching hides untested paths**: Nested `if`, `switch`, and loops create combinatorial execution branches that test suites fail to cover.
3. **Prose rules are forgotten**: Instructions in markdown documents are lost when context windows compact.

**The systemfsoftware rule**: Any code change that regresses without the TypeScript compiler, an Oxlint rule, or a mutation test failing is rejected. Rules must be executable checks.

---

## Cell Architecture

The Cell Architecture (`compound-packs/cell-architecture/`) separates business decisions from external I/O.

### The Five-Phase Sandwich Chain

Every interaction with the outside world is structured as a five-phase sequence:

$$\text{read} \longrightarrow \text{decode} \longrightarrow \text{decide} \longrightarrow \text{encode} \longrightarrow \text{write}$$

The phases are enforced at compile time by `@systemfsoftware/effect-cell-types`:

```ts
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Result, Schema as S } from 'effect'
import { decideOrderFulfillment } from './fulfillment.workflow.js'
import { SubmitOrderError, SubmitOrderRequest, SubmitOrderResponse } from './order.schema.js'
import { InventoryStore } from './ports/InventoryStore.js'
import { PaymentLedger } from './ports/PaymentLedger.js'

export const submitOrderCell = Sandwich.named('order.submit')(
  // Phase 1: READ (Impure) — Fetch database records, cache entries, and current time via R
  (req: SubmitOrderRequest) =>
    Effect.gen(function*() {
      const inventory = yield* InventoryStore
      const ledger = yield* PaymentLedger
      const stock = yield* inventory.getAvailableStock(req.sku)
      const credit = yield* ledger.getCustomerCredit(req.customerId)
      return { req, stock, credit }
    }),
)
  // Phase 2: DECODE (Pure) — Parse unknown inputs into validated Command schemas
  .decode(
    Sandwich.pure(({ credit, req, stock }) =>
      S.decodeUnknown(SubmitOrderCommand)({
        orderId: req.orderId,
        sku: req.sku,
        quantity: req.quantity,
        availableStock: stock.quantity,
        creditBalance: credit.balance,
      })
    ),
  )
  // Phase 3: DECIDE (Pure Core) — Execute a pure decision function (CC = 1)
  .decide(decideOrderFulfillment)
  // Phase 4: ENCODE (Pure) — Convert domain decision outcomes into persistence records
  .encode(
    Sandwich.pure((outcome) =>
      Result.match(outcome, {
        onSuccess: (accepted) => new OrderCommittedPayload({ id: accepted.orderId }),
        onFailure: (refusal) => new OrderRefusalLoggedPayload({ reason: refusal._tag }),
      })
    ),
  )
  // Phase 5: WRITE (Impure) — Persist records, update tables, and emit events via R
  .write((payload, { req }) =>
    Effect.gen(function*() {
      const ledger = yield* PaymentLedger
      yield* ledger.commitTransaction(payload)
      return new SubmitOrderResponse({ orderId: req.orderId, status: payload._tag })
    })
  )
```

Calling I/O inside `decide`, skipping a phase, or asserting types without validation (`as`) fails the TypeScript typecheck.

### Pure Decision Workflows (CC = 1)

Decision logic in `Sandwich.decide` must be a `Workflow` created with `Workflow.make`:

- **Cyclomatic complexity = 1**: The function has a single code path.
- **Exhaustive pattern matching**: Branching uses `Match.value(cmd).pipe(..., Match.exhaustive)` over closed tagged unions.
- **No imperative control flow**: `if`, `else`, `switch`, `for`, `while`, and `?:` are prohibited in `*.workflow.ts` by an Oxlint rule.
- **No ambient I/O**: Workflows do not read clocks (`Date.now`), generate random values, or access Effect context services. Clocks and IDs are read during Phase 1 (`read`) and passed into the Command.

```ts
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

export class AllocateStockCommand extends S.Class<AllocateStockCommand>('AllocateStockCommand')({
  orderId: S.String,
  requestedQuantity: S.Int.pipe(S.positive()),
  availableQuantity: S.Int.pipe(S.nonNegative()),
}) {}

export class StockAllocated extends S.TaggedClass<StockAllocated>()('StockAllocated', {
  orderId: S.String,
  quantity: S.Int,
}) {}

export class InsufficientStockRefusal extends S.TaggedClass<InsufficientStockRefusal>()('InsufficientStockRefusal', {
  orderId: S.String,
  deficit: S.Int,
}) {}

// Cyclomatic complexity = 1: Single total pipeline ending with Match.exhaustive
export const allocateStockWorkflow = Workflow.make(
  AllocateStockCommand,
  (cmd): Result.Result<StockAllocated, InsufficientStockRefusal> =>
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
)
```

### The Four-Channel Contract

Every Cell is typed as `Cell<in I, out A, out E, out R>`:

| Channel           | Role                                    | Invariant                                                                                                                                                              |
| :---------------- | :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`I` (Input)**   | Request or command parameters.          | Schema-validated and total.                                                                                                                                            |
| **`A` (Outcome)** | Successful outcome or business refusal. | **Domain refusals live on channel A.** `InsufficientStock`, `CreditHold`, and `OrderRejected` are valid business decisions, encoded in Phase 4 and written in Phase 5. |
| **`E` (Failure)** | Infrastructure errors.                  | Reserved for transport crashes (`DatabaseCrash`, `SocketTimeout`, `SchemaDecodeError`). Never used for business decisions.                                             |
| **`R` (Context)** | Service requirements.                   | Services required by `read` and `write`. Must be satisfied ($R = \text{never}$) before `.run()`.                                                                       |

### Service & Layer Boundaries

Following `compound-packs/cell-architecture/service-and-layer-boundaries.md`:

- Capability contracts are declared as `Context.Service<Self, Shape>()(...)` in dedicated `*.service.ts` modules with zero driver imports (`.port.ts` and `.layer.ts` suffixes are prohibited).
- Concrete implementations export parameterized `layer(options)` factories from dedicated driver/store modules (e.g. `src/drivers/*`, `src/store/*`). Static `*Live` singletons are reserved strictly for the application composition root (`main.ts`).
- Dependencies bind **once** at the application entrypoint via `Cell.provide(AppStack)`; mid-pipeline binding (`Effect.provide` inside cells) is forbidden.

### Resource & Lifecycle Algebra

Infrastructure and capability packages (container runners, sandbox drivers, process managers) manage resources directly without application port ceremony:

- **Scoped lifecycles**: Resources acquire inside Effect `Scope` with escalating finalizers. Imperative `start()` and `stop()` methods are prohibited (`scoped-lifecycle-boundaries.md`).
- **Resource and handle pairing**: Declarative specifications compile directly to scoped instances or parameterized layers (`resource-vs-handle-duality.md`).
- **Dual syntax support**: Operations are callable both as object methods and as data-last `pipe()` combinators (`pipeable-dual-parity.md`).
- **Cause preservation**: Errors preserve underlying failure details via `cause: Schema.optional(Schema.Unknown)` (`four-channel-contracts.md`).

---

## Boundary Testing & Local Oracles

Mocking internal I/O glue hides integration bugs:

```text
Without oracles (mocks):
  Test ──► [ vi.fn() stub ] ──► Asserts mock was called
  (No sockets opened, no filesystem accessed, false confidence)

With system oracles:
  Test ──► [ Boundary adapter ] ──► Local loopback socket (127.0.0.1:0)
  (Real TCP connection, verified acceptance and refusal, zero handle leaks)
```

The Boundary Testing doctrine (`compound-packs/boundary-testing/`) requires:

1. **No driver mocks**: Do not mock platform modules (`net`, `fs`, `child_process`, `sql`). Pure logic belongs in a `Workflow` covered by property tests. Boundary adapters must run against real local OS resources.
2. **Local system oracles**: Ephemeral kernel ports (`127.0.0.1:0`), temporary file directories, and child processes serve as test fixtures.
3. **Dual-condition checks**: Every boundary test verifies both acceptance (an active listener connects) and refusal (a closed port refuses immediately without timing out or leaking resources).

---

## Monorepo Package Map

Run `pnpm map` to inspect packages, versions, and build gates:

### Cell & Workflow Core

| Package                                                                | Version | Description                                                                        | Gate                                                      |
| :--------------------------------------------------------------------- | :------ | :--------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| [`@systemfsoftware/effect-cell-types`](packages/effect-cell-types)     | `1.2.0` | Type contracts for workflows, Arrow chains (`Sandwich`), and five-phase pipelines. | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-readiness`](packages/effect-readiness)       | `1.0.0` | Pure readiness verification workflows, polling policies, and socket/HTTP probes.   | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-microsandbox`](packages/effect-microsandbox) | `1.0.0` | Declarative container specifications and isolated microVM testcontainers.          | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-daemon-spec`](packages/effect-daemon-spec)   | `1.0.0` | Supervision tree daemon primitives, leader election, and health monitors.          | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |

### Schema & Property Law

| Package                                                                                      | Version | Description                                                                               | Gate                                                      |
| :------------------------------------------------------------------------------------------- | :------ | :---------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| [`@systemfsoftware/effect-schema-law`](packages/effect-schema-law)                           | `1.0.0` | Property-test generators verifying schema encode/decode roundtrips and canonical subsets. | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-vite`](packages/effect-schema-vite)                         | `1.0.0` | Vite plugin that finds exported schemas and generates inline property test suites.        | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-discovery`](packages/effect-schema-discovery)               | `1.0.0` | AST scanner that finds exported Schema declarations across packages.                      | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-schema-recursion-budget`](packages/effect-schema-recursion-budget) | `1.0.0` | Cycle detection and recursion depth guards for recursive schemas.                         | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/hex-schema`](packages/hex-schema)                                         | `1.0.0` | Schema transformations for validated hex-encoded strings and buffers.                     | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |

### Specification & BDD Verification

| Package                                                                | Version | Description                                                                                     | Gate                                              |
| :--------------------------------------------------------------------- | :------ | :---------------------------------------------------------------------------------------------- | :------------------------------------------------ |
| [`@systemfsoftware/effect-gherkin-spec`](packages/effect-gherkin-spec) | `1.0.0` | Gherkin BDD syntax executing Given/When/Then steps as typed Effect workflows.                   | `build`, `lint`, `typecheck`, `test`, `attw`      |
| [`@systemfsoftware/storybook-gherkin`](packages/storybook-gherkin)     | `1.0.0` | Gherkin scenarios executed as play functions in Storybook browser tests.                        | `build`, `lint`, `typecheck`, `test`, `api:check` |
| [`@systemfsoftware/differential-spec`](packages/differential-spec)     | `1.0.0` | Differential testing engine comparing candidate code outputs against reference implementations. | `build`, `lint`, `typecheck`, `test`              |

### Oxlint Static Rules

| Package                                                                                                      | Version | Description                                                                         | Gate                                                      |
| :----------------------------------------------------------------------------------------------------------- | :------ | :---------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| [`@systemfsoftware/oxlint-plugin-cell-architecture`](packages/oxlint-plugin/oxlint-plugin-cell-architecture) | `1.2.0` | Enforces sandwich phase ordering, workflow purity, and inward dependency direction. | `build`, `lint`, `typecheck`, `test`, `api:check`         |
| [`@systemfsoftware/oxlint-plugin-effect-platform`](packages/oxlint-plugin/oxlint-plugin-effect-platform)     | `1.0.0` | Validates Effect Platform service usage, layer creation, and resource scopes.       | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/oxlint-plugin-effect-schema`](packages/oxlint-plugin/oxlint-plugin-effect-schema)         | `1.0.0` | Flags schema decoding anti-patterns, manual type casts, and unvalidated models.     | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/oxlint-plugin-test-discipline`](packages/oxlint-plugin/oxlint-plugin-test-discipline)     | `1.0.0` | Prohibits mocking drivers on internal glue code and enforces oracle assertions.     | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |

### Infrastructure & Tooling

| Package                                                  | Version | Description                                                                    | Gate                                                      |
| :------------------------------------------------------- | :------ | :----------------------------------------------------------------------------- | :-------------------------------------------------------- |
| [`@systemfsoftware/rx-effect`](packages/rx-effect)       | `1.0.0` | Bridge connecting RxJS Observables to backpressured Effect Streams.            | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/effect-memfs`](packages/effect-memfs) | `1.0.0` | In-memory implementation of Effect Platform `FileSystem` for isolated testing. | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |
| [`@systemfsoftware/npm-package`](packages/npm-package)   | `1.0.0` | Schema models and codecs for validating npm `package.json` manifests.          | `build`, `lint`, `typecheck`, `test`, `attw`, `api:check` |

---

## Architectural Compound Packs

Architectural rules are published as [Compound Engineering Packs](https://every.to/compound-engineering/guides/packs):

- [`compound-packs/cell-architecture/`](compound-packs/cell-architecture): The five-phase sandwich chain, single-path workflows, four-channel separation, inward dependencies, scoped resource lifecycles, and parameterized layer constructors.
- [`compound-packs/boundary-testing/`](compound-packs/boundary-testing): Zero driver mocks, local loopback oracles, and staged protocol evidence.

### Using Packs in Downstream Projects

To vendor and enforce these packs in downstream repositories using the Compound Engineering CLI, add them to `.compound-engineering/config.yaml`:

```yaml
packs:
  - source: https://github.com/systemfsoftware/systemfsoftware/tree/main/compound-packs/cell-architecture
  - source: https://github.com/systemfsoftware/systemfsoftware/tree/main/compound-packs/boundary-testing
```

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

## Example Application: Inventory Fulfillment

The repository includes a complete example application in [`examples/inventory-fulfillment/`](examples/inventory-fulfillment):

- **Transport**: `effect/unstable/rpc` over `@effect/platform-node`.
- **Persistence**: `drizzle-orm` over `@effect/sql-pg` (production) and `@effect/sql-pglite` (tests).
- **Business rules**: Multi-warehouse stock allocation, lot expiry filtering, VIP credit limits, and bundle expansion.
- **Concurrency**: Compare-and-swap (CAS) optimistic concurrency with exponential backoff, isolated to Phase 5 (`write`).
- **Integration tests**: Sociable scenarios run against embedded PostgreSQL with no mock objects.

Run the test suite:

```bash
pnpm --filter @systemfsoftware/example-inventory-fulfillment test
```

---

## Examples

Runnable full-stack reference applications and integration suites live in [`examples/`](examples):

- [`examples/inventory-fulfillment/`](examples/inventory-fulfillment): End-to-end e-commerce fulfillment engine exercising Effect RPC, Drizzle ORM over PGlite/Postgres, Better-Auth session validation, and CAS optimistic concurrency retry loops.

More end-to-end examples demonstrating complex domain models and capability drivers will be added under [`examples/`](examples).

## Contributing

Review [CONTRIBUTING.md](CONTRIBUTING.md) for local environment setup (Node 24, pnpm 11, Nix flakes) and commit conventions.

Pre-delivery check command:

```bash
pnpm check:local
```

---

## License

Distributed under the [Apache 2.0 License](LICENSE).
