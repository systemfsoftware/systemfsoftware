---
title: Services are declared in *.service.ts with an optional pure static layer, driver-backed layers live in src/drivers/<technology>.ts, and bindings occur once at the composition root
applies_when:
  - declaring a Context.Service, capability contract, or environment dependency
  - implementing a Layer that provides a Service to R
  - deciding between a static layer on the Service class, a driver module's layer, and an application *Live
  - wrapping a promise-based SDK client in a service
  - providing layers, stores, or adapters to a cell pipeline
  - naming or reviewing service definition files and implementation modules
tags: [cell, service, context-service, layer, composition-root, dependency-inversion, taxonomy]
---

In the Effect lineage (`gcanti-tim-smart-style`), environment capabilities are **Services** (`Context.Service`), not Hexagonal "ports". Implementations provide those services via **Layers**, but are not "layers" themselves.

This rule unifies the lifecycle of dependencies across three orthogonal concerns: file taxonomy, layer provisioning tiers, and composition root binding.

Arbitrary suffix splattering like `*.port.ts` or `*.layer.ts` is strictly prohibited.

### 1. File Extension Taxonomy

| Extension           | Role             | Contents                                                                                                                 | Invariants                                                                                                                                                                                                                                                          |
| :------------------ | :--------------- | :----------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`*.service.ts`**  | Service Contract | `Context.Service<Self, Shape>()(...)`, its `Shape` interface, and optionally a pure `static readonly layer` on the class | Zero driver/transport imports; only pure types, Effect primitives (`Context`, `Effect`, `Layer`, `Scope`) and platform service tags (`FileSystem`, `Path`).                                                                                                         |
| **`*.workflow.ts`** | Pure Decision    | `Workflow.make(Command, decider)`                                                                                        | Complexity 1, total, no I/O, no `R`.                                                                                                                                                                                                                                |
| **`*.schema.ts`**   | Data Contract    | Schemas (`S.Struct`, `S.TaggedStruct`, unions, `Schema.TaggedError`) and the operations over the types the file declares | Imports only pure Effect modules, the schema family, `effect/Effect` for fallible codec getters, other `*.schema.ts` files and workspace packages. Every exported function is an operation on a type this file declares. Selected by the package's mutation config. |
| **`*.cell.ts`**     | Imperative Shell | `Sandwich.named(...)`                                                                                                    | Coordinates read, decode, decide, encode, write. Exports its cell and nothing else; helpers stay private.                                                                                                                                                           |

Concrete implementation modules that satisfy a service contract through a driver or platform runtime (e.g. Drizzle, PostgreSQL, Memfs, Node fs) are standard TypeScript modules in `src/drivers/<technology>.ts`, named after the technology they bind (e.g. `src/drivers/memfs-file-system.ts`, `src/drivers/drizzle-ledger.ts`), never `*.layer.ts`. A codec for the wire format a driver speaks is that driver's own `*.schema.ts` file beside it, importing the domain type; the domain schema holds no provider grammar.

### 2. The Three Layer Provisioning Tiers

Which form a Layer takes is governed by **package boundary vs. application boundary** and **whether the implementation needs a driver**:

| Tier                              | Form                                                    | Scope                                                    | Consumer                                 | Invariant                                                                                    |
| :-------------------------------- | :------------------------------------------------------ | :------------------------------------------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------- |
| **1. Application Live Singleton** | `export const <Service>Live`                            | Application composition root (`main.ts` / `AppLayer.ts`) | Application entrypoint                   | Binds concrete deployment choices at the application edge. **Banned in reusable libraries.** |
| **2. Pure Static Layer**          | `static readonly layer = Layer.effect(this, this.make)` | Service class (`*.service.ts`)                           | Callers that need the service            | Pure Effect: imports no driver or platform runtime.                                          |
| **3. Driver Module**              | `export const layer = (options?) => Layer...`           | Driver module (`src/drivers/<technology>.ts`)            | Composition root importing driver module | Holds every driver import, so the `*.service.ts` contract stays pure.                        |

Tier 2 uses Effect v4's names on the Service class: `layer` for the implementation, `layerTest` for a test double, and `layerConfig` for a layer that reads its options through `Config`. `Layer.effect` is dual ([`Layer.ts#L1012-L1025`](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/src/Layer.ts#L1012-L1025)): the two-argument form `Layer.effect(this, this.make)` and the curried form `Layer.effect(this)(this.make)` build the same Layer, and Effect's own services use the curried form on the class ([`cluster/MessageStorage.ts#L1209`](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/src/cluster/MessageStorage.ts#L1209)).

```ts
// src/workspace.service.ts
import { Context, Effect, FileSystem, Layer } from 'effect'

export interface WorkspaceShape {
  readonly read: (path: string) => Effect.Effect<string>
}

export class Workspace extends Context.Service<Workspace, WorkspaceShape>()('app/Workspace') {
  static readonly make = Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return Workspace.of({ read: (path) => Effect.orDie(fs.readFileString(path)) })
  })

  static readonly layer: Layer.Layer<Workspace, never, FileSystem.FileSystem> = Layer.effect(this, this.make)
}
```

- **`make` only acquires and wires.** It yields the services it needs, acquires resources, and assembles the shape. Every decision is a `Workflow.make` in a `*.workflow.ts` file that the package's mutation config includes; logic written inside `make` escapes the mutation gate.
- **A layer may require a platform service, never provide one.** Importing a platform service tag (`FileSystem`, `Path`) and leaving it in the layer's `R` channel is pure. Providing it with a concrete driver (`NodeFileSystem.layer`) belongs in `src/drivers/<technology>.ts` or the composition root.

#### Decision Tree

```text
Does the implementation require external drivers or runtime I/O (Postgres, Drizzle, Redis, Node fs)?
 │
 ├── NO (Pure Effect; may require platform service tags in R):
 │    │
 │    └── static readonly layer = Layer.effect(this, this.make) on the Service class in *.service.ts
 │        (layerTest for a test double, layerConfig for options read through Config)
 │
 └── YES (Requires third-party drivers / platform runtimes):
      │
      ├── In *.service.ts:
      │    └── Context.Service declaration only (zero driver imports, no driver-backed Layer).
      │
      └── In src/drivers/<technology>.ts:
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
2. **Inward Dependency Direction**: The driver module or package depends inward on the core service contract. The core contract never imports or references the driver. Domain workflows and pure cells import only the capability port; they never import concrete layers or driver libraries.
3. **Layer Construction Export**: The driver package exports a parameterized `layer(options)` function (or a cohesive namespace barrel `export * as DrizzleLedger from '...'`), never static `*Live` singletons.

### 4. Composition Root Binding Invariants

Capability services required by a cell pipeline's `R` channel must be provided **exactly once** at the application composition root (`main.ts` or test bootstrap) using `Cell.provideContext(context)`:

1. **Single Binding Site**: Cell pipelines accumulate required services in `R` as they compose. The composition root constructs the concrete adapter stack (`Layer.mergeAll(...)`) and builds the context once (`Layer.build` or `ManagedRuntime`), and eliminates `R` via `Cell.provideContext(context)`.
2. **Run Edge Invariant (`R = never`)**: Calling `cell.run(input)` requires that all service dependencies in `R` have been eliminated (reduced to `never`). The only lawful exception is `Scope` when the edge wraps execution in `Effect.scoped`.
3. **No Mid-Pipeline Binding**: Never call `Effect.provide(program, layer)`, `Cell.provideContext`, or rebuild layers inside the body of a domain cell, workflow, or route handler. Mid-pipeline binding scatters dependency wiring, prevents substitution during testing, and recreates service instances per request. The carve-out is request-scoped services (the current user, a request id, a tenant handle): edge middleware provides them once per request, before the handler body runs.
4. **No `*Live` in Libraries**: Reusable capability and SDK libraries expose a tier 2 static `layer` or a tier 3 driver module `layer(spec)` constructor, never static `*Live` singletons.
5. **Service Tags Cannot Carry Type Parameters for Isolation**: Effect's `Context` holds services in a `ReadonlyMap<string, any>` (field `mapUnsafe`, [`Context.ts#L471`](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/src/Context.ts#L471)) keyed by each key's string identifier ([`Context.ts#L68`](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/src/Context.ts#L68)). Generic parameters are erased to that one runtime key string, so generic tags like `Tag<Store<Tenant>>` share a single entry and collide. Scoped data boundaries (tenants, sessions, workspaces) must be constructed at the request edge as distinct value handles, not differentiated via generic type parameters on ambient tags.

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
import { Effect, Layer } from 'effect'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { NodeRuntime } from '@effect/platform-node'
import * as DrizzleLedger from './drivers/drizzle-ledger.js'
import { PgClientLive } from './drivers/pg-client.js'
import { transferCell } from './transfer.cell.js'

// 1. Parameterized driver layer resolved with dependencies:
const LedgerLive = DrizzleLedger.layer().pipe(Layer.provide(PgClientLive))

const program = Effect.gen(function*() {
  // 2. Build the context once, under the root scope:
  const ledgerContext = yield* Layer.build(LedgerLive)

  // 3. Bind it once to eliminate R -> never:
  const runnableCell = transferCell.pipe(Cell.provideContext(ledgerContext))

  // 4. R is now never -> safe to run at the edge:
  return yield* runnableCell.run(input)
})

NodeRuntime.runMain(Effect.scoped(program))
```

### 6. SDK-borrow accessors (`use`)

A promise-based SDK client is wrapped in a service whose shape is one accessor:

```ts
use: ;
;(<A>(f: (client: Client, signal: AbortSignal) => Promise<A>) => Effect.Effect<A, ClientError>)
```

- **It is a driver-level service.** It binds a vendor SDK, so its Layer lives in `src/drivers/<technology>.ts`, never in a `*.service.ts` file.
- **It threads the fiber's `AbortSignal`** into every call, so interrupting the fiber cancels the request, and it maps every rejection to one tagged error carrying `cause`.
- **It never exports the raw client.** A handed-out client escapes the signal and the error mapping, and its calls run outside the fiber.
- **Domain code never calls `use`.** Typed per-operation services (`resolveUsername`, `submitOrder`) are built on top of it, and cells depend on those.
- **It is not Effect's `Key.use`.** Effect's `use` ([`Context.ts#L101`](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/src/Context.ts#L101)) passes the service shape to a function that returns an Effect; the SDK-borrow `use` passes the SDK client to a function that returns a Promise.

```ts
// WRONG: the raw client escapes the fiber's signal and the error mapping
export interface ChainClientShape {
  readonly useClient: () => Effect.Effect<Client>
}

// RIGHT: src/drivers/chain-sdk.ts
export class ChainClientError extends Schema.TaggedError<ChainClientError>()('ChainClientError', {
  cause: Schema.Defect(),
}) {}

export interface ChainClientShape {
  readonly use: <A>(f: (client: Client, signal: AbortSignal) => Promise<A>) => Effect.Effect<A, ChainClientError>
}

export const layer = (options: ChainClientOptions): Layer.Layer<ChainClient> =>
  Layer.effect(
    ChainClient,
    Effect.gen(function*() {
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => createClient(options)),
        (client) => Effect.sync(() => client.destroy()),
      )
      return ChainClient.of({
        use: (f) =>
          Effect.tryPromise({
            try: (signal) => f(client, signal),
            catch: (cause) => new ChainClientError({ cause }),
          }),
      })
    }),
  )
```

Gate: `review` — verify:

1. Service contracts live in `*.service.ts` and import zero database, transport, or platform runtime drivers; a Layer on the Service class is pure, and a driver-backed Layer lives in `src/drivers/<technology>.ts`.
2. No files use `.port.ts` or `.layer.ts` suffixes.
3. Static `*Live` identifiers do not appear in reusable libraries; they are defined only at the application composition root.
4. Neither `Effect.provide` nor `Cell.provideContext` appears in the body of a domain cell, workflow, or route handler; request-scoped services are provided in edge middleware.
5. A `make` acquires and wires only; every decision is a `Workflow.make` in a mutation-covered `*.workflow.ts`.
6. An SDK-borrow `use` service lives in a driver module, threads the fiber's `AbortSignal`, maps rejections to one tagged error with `cause`, and never exports the raw client.
7. Service tags do not carry generic type parameters to distinguish instances; distinct scopes are provided as separate value handles.
