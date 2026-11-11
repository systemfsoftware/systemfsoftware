# systemfsoftware

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/systemfsoftware/systemfsoftware/actions)

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

`@systemfsoftware/effect-cell-types` is not on npm: nix.systemfsoftware.com is the package registry for `@systemfsoftware` packages. Add this repository as a flake input and take its tarballs through the consumer route in [pnpm-release-management](https://github.com/systemfsoftware/pnpm-release-management#distribution-through-nix), then add the peer dependency:

```bash
pnpm add 'effect@^4'
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

- [Cell Architecture](compound-packs/cell-architecture): File kinds, services and layers, handles and scopes, and cell composition in packages built on @systemfsoftware/effect-cell-types.
- [Schema Modelling](compound-packs/schema-modelling): How Effect Schema declares invariants, states and foreign wire shapes, how refined values generate, and how failing generated laws and refusal properties are handled.
- [Configuration](compound-packs/configuration): How an application's settings reach its code through a `<Feature>Config` in context, and how each environment variable is declared as one described Config in src/config.ts.
- [Package Surface](compound-packs/package-surface): What a workspace package exposes through its exports map, under how many names, and how a change to that surface is versioned.
- [Testing](compound-packs/testing): What a behaviour test proves and is named for, what a test imports, where test doubles live, how fakes and adapters are proven, and how a failing test or a surviving mutant is resolved.
- [Property Testing](compound-packs/property-testing): What makes a property test a real property: drawn inputs that reach the decision, constructed boundaries and collisions, an oracle independent of the code under test, coverage the run proves, reproducible evidence the property can fail, which properties a Workflow decider needs, and how a reviewer tells a smoke property from an unproven one.
- [UI State](compound-packs/ui-state): How React component and hook code in an effect-atom application reads data, runs Effects and derives display values.
- [UI Testing](compound-packs/ui-testing): How a UI's behaviour is proven by Storybook stories: where a story's I/O comes from, how its fakes stay fresh, how a journey reads, and how stories query, size and fail.
- [Page Accessibility](compound-packs/page-accessibility): How a static or island site's built pages are accessibility-tested in a real browser: axe at WCAG 2.2 AA plus best-practice in every colour scheme and at narrow and wide widths, needs-review contrast and non-text contrast, keyboard, focus, pointer targets, 200% zoom, reflow and text spacing, reduced motion and pausable motion, forced colours, structure, text alternatives, forms, and ARIA snapshots of key regions.
- [Design System](compound-packs/design-system): How an app builds and styles UI with the Astryx design system through Tailwind: components, token utilities, where styles may be written, roots, themes and navigation.
- [Screen Content](compound-packs/screen-content): What a user-facing screen shows and says: real data, claims the deployed product delivers, failure states that say what happened and what to do next, and copy without stock AI patterns.
- [CI Workflows](compound-packs/ci-workflows): What a CI check is for, and that CI never grades the repository itself.
- [Public Repository](compound-packs/public-repository): What a public repository never contains: private repository, package and product names, private tracker ids or local filesystem paths.

Concepts, definitions, and verification gates are indexed in [CONCEPTS.md](CONCEPTS.md).

---

## Install a package

Install `@systemfsoftware` packages from **https://nix.systemfsoftware.com**, the registry for this organization's packages, through a Nix flake. Do not install them with `npm install` or `pnpm add`: the npm copies on the public registry are older builds that this repository no longer publishes.

Add this repository as a flake input, and give your flake the registry as a substituter:

```nix
{
  nixConfig = {
    extra-substituters = "https://nix.systemfsoftware.com";
    extra-trusted-public-keys = "nix-cache-1:wXA8I4DayNW9q6enUyQA/P/nT38pGSTLt374t3gsn7M=";
    fallback = true;
  };

  inputs = {
    producer.url = "github:systemfsoftware/systemfsoftware/<rev>";
    nixpkgs.follows = "producer/nixpkgs";
    pnpm-release-management.url = "github:systemfsoftware/pnpm-release-management";
  };
}
```

Then take the producer's tarballs and a pnpm store built from them with `lib.mkProducerTarballs` and `lib.mkPnpmConsumerStore` from `pnpm-release-management`. The full consumer route, including the `files.".deps"` wiring, is in [Distribution through Nix](https://github.com/systemfsoftware/pnpm-release-management#distribution-through-nix).

Third-party peers install from npm as usual. For example, `effect` is `^4.1.2`:

```bash
pnpm add 'effect@^4'
```

## Packages

### Core architecture

| Package                                                                 | What it is                                                                                                |
| :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| [`@systemfsoftware/effect-cell-types`](packages/effect-cell-types)      | Type contracts for the cell taxonomy: branded `Workflow` types, the `Sandwich` stage builder, and `Cell`. |
| [`@systemfsoftware/effect-atom`](packages/atom/effect-atom)             | Reactive toolkit for Effect, forked from `tim-smart/effect-atom`.                                         |
| [`@systemfsoftware/effect-atom-react`](packages/atom/effect-atom-react) | React bindings for `effect-atom`.                                                                         |

### Schema and property laws

| Package                                                                                             | What it is                                                                                              |
| :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| [`@systemfsoftware/effect-schema-law`](packages/schema/effect-schema-law)                           | Turns an Effect Schema's codec laws (round-trip identity, encode stability) into Vitest property tests. |
| [`@systemfsoftware/effect-schema-vite`](packages/schema/effect-schema-vite)                         | Vite plugin that discovers Schema exports and injects the law tests.                                    |
| [`@systemfsoftware/effect-schema-discovery`](packages/schema/effect-schema-discovery)               | Source-discovery walk for the Vite law plugin.                                                          |
| [`@systemfsoftware/effect-schema-recursion-budget`](packages/schema/effect-schema-recursion-budget) | `recursionBudget` annotations for recursive Schema unions.                                              |

### Specs and simulation

| Package                                                                        | What it is                                                                          |
| :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| [`@systemfsoftware/effect-gherkin-spec`](packages/gherkin/effect-gherkin-spec) | Gherkin Given/When/Then steps that run as Effects under Vitest.                     |
| [`@systemfsoftware/storybook-gherkin`](packages/gherkin/storybook-gherkin)     | Gherkin scenarios that run as Storybook play functions.                             |
| [`@systemfsoftware/effect-spec-runtime`](packages/effect-spec-runtime)         | Registrar core behind the Effect spec harnesses.                                    |
| [`@systemfsoftware/trace-spec`](packages/trace/trace-spec)                     | Trace contracts as executable specs, checked against an in-memory exporter.         |
| [`@systemfsoftware/trace-taxonomy`](packages/trace/trace-taxonomy)             | Declared spans with typed required attributes.                                      |
| [`@systemfsoftware/differential-spec`](packages/sim/differential-spec)         | Differential testing of candidate code against a reference implementation.          |
| [`@systemfsoftware/conformance-spec`](packages/sim/conformance-spec)           | Concurrency conformance checks: linearizability against a pure model.               |
| [`@systemfsoftware/effect-sim-kernel`](packages/sim/effect-sim-kernel)         | Deterministic simulation kernel with a controlled scheduler and deadlock detection. |

### Test and build tooling

| Package                                                                               | What it is                                                                                  |
| :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------ |
| [`@systemfsoftware/vitest`](packages/runner/vitest)                                   | Fork of `@effect/vitest` whose defaults suit Effect tests.                                  |
| [`@systemfsoftware/tsconfig`](packages/toolchain/tsconfig)                            | Shared TypeScript base configs.                                                             |
| [`@systemfsoftware/vitest-config`](packages/toolchain/vitest-config)                  | Shared Vitest configuration.                                                                |
| [`@systemfsoftware/tsdown-config`](packages/toolchain/tsdown-config)                  | Shared tsdown build configuration.                                                          |
| [`@systemfsoftware/stryker-config`](packages/toolchain/stryker-config)                | Shared Stryker mutation-testing configuration.                                              |
| [`@systemfsoftware/omp-typescript-discipline`](omp/plugins/omp-typescript-discipline) | OMP plugin that enforces project references for tooling files and pure tsconfig boundaries. |

### Oxlint rules and presets

| Package                                                                                                       | What it is                                                                       |
| :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------- |
| [`@systemfsoftware/oxlint-plugin-cell-architecture`](packages/oxlint-plugin/oxlint-plugin-cell-architecture)  | Rules for cell boundary isolation, tag discipline and export structure.          |
| [`@systemfsoftware/oxlint-plugin-dmmf-workflow`](packages/oxlint-plugin/oxlint-plugin-dmmf-workflow)          | Purity, exhaustiveness and complexity rules for a `Workflow.make` decision body. |
| [`@systemfsoftware/oxlint-plugin-effect-platform`](packages/oxlint-plugin/oxlint-plugin-effect-platform)      | Effect Platform entrypoint, I/O boundary and native-global rules.                |
| [`@systemfsoftware/oxlint-plugin-effect-schema`](packages/oxlint-plugin/oxlint-plugin-effect-schema)          | Rules for Effect Schema declarations: tagged errors and schema file shape.       |
| [`@systemfsoftware/oxlint-plugin-test-discipline`](packages/oxlint-plugin/oxlint-plugin-test-discipline)      | Rules for property-test laws, test placement and test naming.                    |
| [`@systemfsoftware/oxlint-config-recommended`](packages/oxlint-presets/oxlint-config-recommended)             | Preset combining the rule sets below.                                            |
| [`@systemfsoftware/oxlint-config-cell-architecture`](packages/oxlint-presets/oxlint-config-cell-architecture) | Preset for cell boundaries.                                                      |
| [`@systemfsoftware/oxlint-config-dmmf`](packages/oxlint-presets/oxlint-config-dmmf)                           | Preset for workflow purity and schema boundaries.                                |
| [`@systemfsoftware/oxlint-config-rule-authoring`](packages/oxlint-presets/oxlint-config-rule-authoring)       | Preset for authoring custom Oxlint AST plugins.                                  |

### In their own repositories

These packages left this repository. Each one is built, tested and versioned in its own `systemfsoftware/<repo>`:

| Repository         | Packages                                                                                 |
| :----------------- | :--------------------------------------------------------------------------------------- |
| `effect-readiness` | `@systemfsoftware/effect-readiness`                                                      |
| `effect-daemon`    | `@systemfsoftware/effect-daemon-spec`, `-conformance`, `-process`, `-socket`, `-cluster` |
| `effect-microvm`   | `@systemfsoftware/effect-microsandbox`, `@systemfsoftware/effect-daemon-microvm`         |
| `effect-e2e`       | `@systemfsoftware/effect-e2e`, `-web`, `-cli`                                            |
| `hex-schema`       | `@systemfsoftware/hex-schema`, `@systemfsoftware/effect-schema-extensions`               |
| `discern`          | `@systemfsoftware/discern`                                                               |
| `effect-memfs`     | `@systemfsoftware/effect-memfs`                                                          |
| `npm-package`      | `@systemfsoftware/npm-package`                                                           |
| `rx-effect`        | `@systemfsoftware/rx-effect`                                                             |

## Roadmap: Non-Autoregressive Decisions (Jev)

Our strategy (`STRATEGY.md`) establishes a boundary: **No LLM-as-judge review products.** Gates must be executable programs that fail commands, not models generating opinions.

Certain decisions cannot be resolved by AST linting alone:

- Did a code diff introduce a breaking semantic change to a public API?
- Does a refactor increase regression risk?
- How should an un-typed incoming payload route across internal handlers?

To handle these questions without conversational prompts, our roadmap integrates **System One Decision Models** — specifically TypeSafe's **Jev** model via Effect v4's `Decision` and `DecisionModel` modules (`effect/ai/Decision`):

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

The cell architecture's worked example is the [Effect Endgame Starter Kit](https://github.com/systemfsoftware/effect-endgame-starter-kit): one Cloudflare Worker whose guestbook feature runs a pure `Workflow.make` decision over Effect RPC and D1, with its property laws, browser journeys and removal steps. Start a project from it with `gh repo create <name> --template systemfsoftware/effect-endgame-starter-kit`.

---

## Documentation

- [Cell Architecture](compound-packs/cell-architecture): file kinds, services and layers, and how cells compose.
- [Schema Modelling](compound-packs/schema-modelling): how Effect Schema declares invariants and wire shapes.
- [Testing](compound-packs/testing) and [Property Testing](compound-packs/property-testing): what a behaviour test proves, and what makes a property real.
- [Package Surface](compound-packs/package-surface): what a workspace package exposes through its `exports` map.
- [CONCEPTS.md](CONCEPTS.md): the domain vocabulary and verification gates.

The other packs under [`compound-packs/`](compound-packs) cover configuration, UI state and testing, design system, page accessibility, CI workflows and public-repository rules.

## Contributing

Local setup, Nix flakes, the commit convention and the pre-delivery check are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0. See [LICENSE](LICENSE).
