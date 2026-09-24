---
title: Services are declared as *.service.ts, implementations export parameterized layers, and bindings occur once at the composition root
applies_when:
  - declaring a Context.Service, capability contract, or environment dependency
  - implementing a Layer that provides a Service to R
  - deciding between static Live, static layer(options), and module-level layer()
  - providing layers, stores, or adapters to a cell pipeline
  - naming or reviewing service definition files and implementation modules
tags: [cell, service, context-service, layer, composition-root, dependency-inversion, taxonomy]
---

In the Effect lineage (`gcanti-tim-smart-style`), environment capabilities are **Services** (`Context.Service`), not Hexagonal "ports". Implementations provide those services via **Layers**, but are not "layers" themselves.

This rule unifies the lifecycle of dependencies across three orthogonal concerns: file taxonomy, layer provisioning tiers, and composition root binding.

Arbitrary suffix splattering like `*.port.ts` or `*.layer.ts` is strictly prohibited.

### 1. File Extension Taxonomy

| Extension           | Role             | Contents                                                    | Invariants                                                                                           |
| :------------------ | :--------------- | :---------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **`*.service.ts`**  | Service Contract | `Context.Service<Self, Shape>()(...)` and `Shape` interface | Zero driver/transport imports; only pure types and Effect primitives (`Context`, `Effect`, `Scope`). |
| **`*.workflow.ts`** | Pure Decision    | `Workflow.make(Command, decider)`                           | Complexity 1, total, no I/O, no `R`.                                                                 |
| **`*.schema.ts`**   | Data Contract    | `Schema.Class`, `Schema.TaggedError`, tagged unions         | Pure schema definitions, encoders/decoders.                                                          |
| **`*.cell.ts`**     | Imperative Shell | `Sandwich.named(...)`                                       | Coordinates read, decode, decide, encode, write.                                                     |

Concrete implementation modules that satisfy a service contract (e.g. via Drizzle, PostgreSQL, Memfs, Node fs) are standard TypeScript modules named after their technology or driver (e.g. `src/drivers/memfs-file-system.ts`, `src/store/LedgerStoreDrizzle.ts`), never `*.layer.ts`.

### 2. The Three Layer Provisioning Tiers

`Live` vs. `layer(options)` vs. module-level `layer()` is governed by **package boundary vs. application boundary** and **driver parameterization**:

| Tier                                        | Form                                    | Scope                                                          | Parameterized?                     | Consumer                                 | Invariant                                                                                    |
| :------------------------------------------ | :-------------------------------------- | :------------------------------------------------------------- | :--------------------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------- |
| **1. Application Live Singleton**           | `export const <Service>Live`            | Application composition root (`main.ts` / `AppLayer.ts`)       | **Zero args** (constant singleton) | Application entrypoint                   | Binds concrete deployment choices at the application edge. **Banned in reusable libraries.** |
| **2. Self-Contained Parameterized Service** | `static readonly layer = (opts) => ...` | Library / service class (`*.service.ts`)                       | **Yes** (typed options/spec)       | Callers configuring the service          | Service has no third-party driver leak; constructor closes over options.                     |
| **3. Driver / Adapter Module**              | `export const layer = (opts?) => ...`   | Driver module (`src/drivers/<tech>.ts`, `src/store/<tech>.ts`) | **Yes or No** (depends on driver)  | Composition root importing driver module | Separates external driver dependencies from the pure `*.service.ts` contract.                |

#### Decision Tree

```text
Does the implementation require external drivers or runtime I/O (Postgres, Drizzle, Redis, Node fs)?
 │
 ├── NO (Pure Effect in-memory / self-contained):
 │    │
 │    ├── Needs configuration? ──► Use static layer(options) on the Service class in *.service.ts
 │    │
 │    └── Needs zero config?   ──► Use static readonly Default on the Service class in *.service.ts
 │
 └── YES (Requires third-party drivers / platform runtimes):
      │
      ├── In *.service.ts:
      │    └── Pure Context.Service declaration ONLY (zero driver imports, zero Layer exports).
      │
      └── In separate driver module (e.g. src/drivers/redis-cache.ts):
           ├── Parameterized factory: export const layer = (options) => Layer...
           └── Application composition root (main.ts): binds as CacheServiceLive = RedisCache.layer(...).pipe(...)
```

### 3. Package Boundary vs. Module Boundary (Driver Isolation)

When satisfying a service contract with third-party drivers (`@effect/sql-pg`, `drizzle-orm`, `memfs`, `better-sqlite3`), choose between an in-repo driver module and a dedicated integration package:

| Seam Type                   | When to Use                                                                                                         | Package Topology                                                                                                        | Example                                       |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **In-Repo Driver Module**   | Internal application or monorepo-private consumption with no external adopters.                                     | Single package: `src/ledger.service.ts` + `src/drivers/drizzle-ledger.ts`                                               | Monorepo application service                  |
| **Separate Driver Package** | Reusable library where external consumers must not inherit heavy or platform-restricted driver dependencies (`R7`). | Core package: `@org/ledger` (contains `ledger.service.ts`)<br>Driver package: `@org/ledger-drizzle` (exports `layer()`) | `@effect/platform` vs `@effect/platform-node` |

Invariants across both forms:

1. **Core Zero-Dependency Guarantee**: The core contract module/package (`*.service.ts`) has zero dependencies on database clients, transport libraries, or platform runtimes.
2. **Inward Dependency Direction**: The driver module or package depends inward on the core service contract. The core contract never imports or references the driver.
3. **Layer Construction Export**: The driver package exports a parameterized `layer(options)` function (or a cohesive namespace barrel `export * as DrizzleLedger from '...'`), never static `*Live` singletons.

### 4. Composition Root Binding Invariants

Capability services required by a cell pipeline's `R` channel must be provided **exactly once** at the application composition root (`main.ts` or test bootstrap) using `Cell.provideContext(context)`:

1. **Single Binding Site**: Cell pipelines accumulate required services in `R` as they compose. The composition root constructs the concrete adapter stack (`Layer.mergeAll(...)`) and builds the context once (`Layer.build` or `ManagedRuntime`), and eliminates `R` via `Cell.provideContext(context)`.
2. **Run Edge Invariant (`R = never`)**: Calling `cell.run(input)` requires that all service dependencies in `R` have been eliminated (reduced to `never`). The only lawful exception is `Scope` when the edge wraps execution in `Effect.scoped`.
3. **No Mid-Pipeline Binding**: Never call `Effect.provide(program, layer)`, `Cell.provideContext`, or rebuild layers inside domain cells, workflows, or route handlers. Mid-pipeline binding scatters dependency wiring, prevents substitution during testing, and recreates service instances per request.
4. **Parameterized Constructors in Libraries**: Reusable capability and SDK libraries export parameterized `layer(spec)` constructors, never static `*Live` singletons.
5. **Service Tags Cannot Carry Type Parameters for Isolation**: Effect's `Context` indexes services in a `ReadonlyMap<string, any>` keyed by each tag's string identifier (`repos/effect/packages/effect/src/Context.ts`). TypeScript erases type parameters at runtime, so generic tags like `Tag<Store<Tenant>>` share a single runtime key and collide. Scoped data boundaries (tenants, sessions, workspaces) must be constructed at the request edge as distinct value handles, not differentiated via generic type parameters on ambient tags.

### 5. Code Examples

#### Wrong: Mid-pipeline binding, driver leaks, and pseudo-hexagonal naming

```ts
// WRONG: .port.ts file leaks driver dependency and exports static Live
// ports/ledger.port.ts
import { PgClient } from '@effect/sql-pg' // Driver leak!
import { Context, Layer } from 'effect'

export class LedgerPort extends Context.Service<LedgerPort, Shape>()('LedgerPort') {}
export const LedgerPortLive = Layer.effect(LedgerPort, ...) // Static singleton in library!

// WRONG: Providing layers inside handler code
export const executeTransfer = (cmd: TransferCmd, layer: Layer.Layer<LedgerPort>) =>
  Effect.provide(transferCell.run(cmd), layer)
```

#### Right: Clean taxonomy, isolated driver, and single binding at composition root

```ts
// File 1: src/ledger.service.ts (pure capability contract, zero driver imports)
import { Context, Effect } from 'effect'
import type { LedgerEntry, LedgerId, LedgerError } from './ledger.schema.js'

export interface LedgerServiceShape {
  readonly record: (entry: LedgerEntry) => Effect.Effect<LedgerId, LedgerError>
}

export class LedgerService extends Context.Service<LedgerService, LedgerServiceShape>()('LedgerService') {}

// File 2: src/drivers/drizzle-ledger.ts (concrete driver module, parameterized layer)
import { PgClient } from '@effect/sql-pg'
import { Layer, Effect } from 'effect'
import { LedgerService } from '../ledger.service.js'

export interface DrizzleLedgerOptions {
  readonly schemaName?: string
}

export const layer = (options?: DrizzleLedgerOptions): Layer.Layer<LedgerService, never, PgClient.PgClient> =>
  Layer.effect(
    LedgerService,
    Effect.gen(function*() {
      const client = yield* PgClient.PgClient
      return {
        record: (entry) => ...
      }
    })
  )

// File 3: src/main.ts (Application composition root)
import { Layer } from 'effect'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { NodeRuntime } from '@effect/platform-node'
import * as DrizzleLedger from './drivers/drizzle-ledger.js'
import { PgClientLive } from './drivers/pg-client.js'
import { transferCell } from './transfer.cell.js'

// 1. Parameterized driver layer resolved with dependencies:
const LedgerLive = DrizzleLedger.layer().pipe(Layer.provide(PgClientLive))

// 2. Bound once via Context built at root to eliminate R -> never:
const runnableCell = transferCell.pipe(Cell.provideContext(ledgerContext))

// 3. R is now never -> safe to launch at edge:
NodeRuntime.runMain(Cell.run(runnableCell, input))
```

Gate: `review` — verify:

1. Service contracts live in `*.service.ts` and import zero database, transport, or platform runtime drivers.
2. No files use `.port.ts` or `.layer.ts` suffixes.
3. Static `*Live` identifiers do not appear in reusable libraries; they are defined only at the application composition root.
4. Neither `Effect.provide` nor `Cell.provideContext` appears inside domain cells, workflows, or route handlers.
5. Service tags do not carry generic type parameters to distinguish instances; distinct scopes are provided as separate value handles.
