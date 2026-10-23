---
title: A driver implementation lives in the application that chooses it, or in its own adapter library once a second unit needs it; the service's library never holds it
applies_when:
  - implementing a service against Postgres, D1, KV, R2, a Durable Object, an HTTP API or a vendor SDK
  - adding a Layer that imports a database client, a cloud binding or a vendor SDK
  - a second application, the infrastructure application or a contract test suite needs the same driver Layer
  - a store implementation shared by two applications
  - tempted to add ./postgres, ./d1 or another driver-named subpath to a library
tags: [composition, drivers, adapters, layers, services, vendors, alchemy]
---

## Rule

A service is declared once, in the library that owns the capability: the `Context.Service` and its shape, with no driver import. An implementation that needs a driver (a database client, a Cloudflare binding, a vendor SDK) is a Layer, and it lives:

1. in the application that chooses it, beside that application's composition root, while that application is the only unit that imports it; or
2. in its own adapter library (`@scope/ledger-postgres`, `@scope/ledger-d1`) that depends inward on the service's library and exports `layer(options)` from its `.` barrel, as soon as a second unit must import it. Three cases make that true from the start:
   - a second application uses the same driver;
   - the Layer declares Cloudflare resources through Alchemy, so both the infrastructure application that owns the Stack and the runtime application import it (pack: composition, stack-has-one-owner.md);
   - the service is a store or a port with a contract or law suite, which must import the driver by specifier (pack: composition, tests-stay-home.md). The suite runs in the adapter library's `tests/`, against `Service.layerTest` from the service's library and against the adapter's own `layer`.

Never in the service's library, never as a subpath of it (`@scope/ledger/postgres`), and never as a static `*Live` value in any library. Swapping a vendor is then one changed `Layer.provide` line in an application; removing a vendor is deleting one adapter (pack: composition, removal-test.md). A test double is not a driver: it is `layerTest` on the service, exported from `.`.

An adapter library never takes a Cloudflare binding object (`D1Database`, `KVNamespace`, the Worker `env`) as a parameter or property. It declares its resource and requires Alchemy's binding service (`Cloudflare.D1.QueryDatabaseBinding`) in its Layer's requirements; the application passes only plain options such as an id and provides the binding service at its composition root (pack: composition, config-at-the-edge.md).

This rule is the single home for runtime-specific implementations of one application's service; (pack: composition, core-and-adapters.md) covers only a platform's whole service set shared by several applications.

It overrides the adapter-module placement in (pack: cell-architecture, service-and-layer-boundaries.md): that file's §1 adapter module that "sits flat beside the service module", its §3 "In-Repo Adapter Module" row and its decision tree's "In an adapter module beside *.service.ts" do not apply in this stack. That file still governs the `*.service.ts` contract itself. Amending it to match is recorded as a gap below.

## Why

A service library that also holds its drivers makes every consumer install every vendor's client, bundle it into a Worker that never uses it, and inherit its runtime constraints. A driver subpath is the same coupling with a longer name: the dependency is still in the library's manifest. Keeping the driver where it is chosen means the library only grows an adapter when a second importer proves it is shared, and a Layer an application keeps inside itself cannot be reached by any other unit's import, which is why a resource-declaring or law-tested driver needs its own library at once.

## Evidence

- Effect: the service is `effect/FileSystem`; `effect-smol/packages/platform-node/src/NodeFileSystem.ts:12` imports it type-only (`import type { FileSystem } from "effect/FileSystem"`), the module exports only the Node Layer, and its header says it "only chooses the Node implementation" (line 7). Twelve `@effect/sql-*` driver packages, one per backend, each with 0-5 dependencies, all peering on `effect` ((pack: composition, evidence/FINDINGS.md) Cycle 003, findings 5-7).
- Rat Stack: "A Layer is one vendor's implementation ... Swapping vendors is a one-line change" ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 5). Its resource-declaring D1 Layer is in a library, `rat-stack/packages/database/src/d1.ts`, and takes only `{ id }`, getting the binding from `Cloudflare.D1.QueryDatabaseBinding` (Rat Stack pipes that provide inside the library; here the application provides it, because only a composition root calls `Layer.provide`). Its `@rat-stack/database` ships drivers as subpaths (`./d1`, `./hyperdrive-postgres`); that half is ruled against here, because a private library exports `.` only (pack: composition, role-entries-only.md).
- Store laws run the fake and the real adapter side by side (pack: boundary-testing, fake-and-real-store-laws.md).

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: packages/ledger/src/mod.ts exports the service and its Postgres driver
export * as Ledger from './Ledger.ts'
export * as PostgresLedger from './postgres-ledger.ts' // imports @effect/sql-pg

// WRONG: packages/ledger-d1/src/D1Ledger.ts takes a binding object
export const layer = (options: { db: D1Database }) => ...

// RIGHT, one application uses a vendor HTTP API and nothing else imports it: workers/ledger/src/fx-rates.ts
import { FxRates } from '@scope/ledger'
export const layer = (options: { baseUrl: string }) => Layer.effect(FxRates.FxRates, make(options))

// RIGHT, a D1 store: packages/ledger-d1/src/D1Ledger.ts, its own library, "." only
import { Ledger } from '@scope/ledger'
export const layer = (options: { id: string }) =>
  Layer.unwrap(Effect.gen(function*() {
    const database = yield* Cloudflare.D1.Database(`${options.id}-d1`, { migrations })
    return Layer.succeed(Ledger.Store, makeD1Store(database))
  }))
// Its requirement Cloudflare.D1.QueryDatabaseBinding is provided by the application's composition root.
// packages/ledger-d1/tests/store-laws.integration.test.ts runs the law suite against
// Ledger.layerTest and D1Ledger.layer, both imported by specifier.
```

## Gate

Gate: none yet. It would read, from the compiler's import graph (`composition-facts.ts`), each library's value imports of packages listed as drivers in the workspace (a declared list, not a name pattern), and fail a library that both declares a `Context.Service` its dependents import and value-imports a driver.

Related facts gated today, not yet run in CI (`.github/workflows/ci.yml` runs only `repo-checks single-plan`; (pack: composition, gates-are-facts-or-calibrated-judges.md)):

- `repo-checks composition-graph` fails a library whose parameter or property type the compiler resolves to Cloudflare's `Env` or to an object holding a binding class (`isCloudflareEnv` in `scripts/tools/repo-checks/composition-facts.ts`). That is the intended result for an adapter library that takes `{ db: D1Database }`; an adapter that requires an Alchemy binding service passes.
- `repo-checks composition-graph` fails a library marked `"layer": "core"` that value-imports a Node builtin, `cloudflare:*`, `@cloudflare/*` or a framework (pack: composition, core-and-adapters.md).

Known gap: (pack: cell-architecture, service-and-layer-boundaries.md) §1, §2 tier 3, §3 and its decision tree still place a driver in an adapter module beside the service; they need the same amendment, in a separate change to that pack.
