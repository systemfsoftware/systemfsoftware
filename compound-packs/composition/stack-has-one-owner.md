---
title: A driver's Layer declares the Cloudflare resources it uses through Alchemy and lives in an adapter library, one infrastructure application owns the Stack, and no runtime code imports that application
applies_when:
  - adding a D1 database, KV namespace, R2 bucket, Queue, Durable Object or Worker to the infrastructure
  - writing or changing alchemy.run.ts or any Alchemy Stack wiring
  - importing alchemy from a library or from Worker runtime code
  - removing a feature that owns cloud resources
tags: [composition, alchemy, cloudflare, infrastructure, stack, layers]
---

## Rule

- **The resource travels with its driver.** The Layer that implements a service against a Cloudflare resource declares that resource through Alchemy (`Cloudflare.D1.Database(...)`, `Cloudflare.KV.Namespace(...)`) and requires its binding service (`Cloudflare.D1.QueryDatabaseBinding`). No other module declares the same resource.
- **That Layer lives in an adapter library from the start** (`packages/ledger-d1`, `"unit": "library"`, `.` only). Both the infrastructure application, which provisions it, and the runtime application, which serves through it, import it, and one application never imports another. This is the second-importer case of (pack: composition, drivers-live-where-chosen.md).
- **One application owns the Stack.** All Stack composition (the file Alchemy runs, conventionally `apps/infra/alchemy.run.ts`) lives in one application whose `unit` is `application`. It provides the driver Layers; providing a Layer provisions its resources on the next deploy, and dropping the line removes them.
- **Nothing imports the Stack.** Runtime code receives its bindings at its own composition root (pack: composition, config-at-the-edge.md); it never imports the infrastructure application. Only applications and driver adapter libraries import `alchemy`; a service library or a core library never does.

## Why

Stack code provisions when it runs. Two owners mean two deploy plans and a resource created twice; runtime code that imports the Stack can deploy infrastructure from a request. When the resource is declared by the Layer that uses it, the unit that knows how to talk to D1 also owns the D1 database: swapping to Postgres is one changed `Layer.provide` line, and deleting the adapter deletes its resources instead of leaving orphans. A resource-declaring Layer kept inside a runtime application could reach the Stack only through an application-to-application import, which (pack: composition, dependency-direction.md) forbids.

## Evidence

- Rat Stack, the only Effect + Alchemy + Cloudflare stack in the survey: the library file `rat-stack/packages/database/src/d1.ts` declares `Drizzle.Schema` and `Cloudflare.D1.Database` inside the vendor Layer and uses `Cloudflare.D1.QueryDatabaseBinding`; `rat-stack/apps/infra/alchemy.run.ts` owns the Stack; its boundary lint rejects imports of `apps/infra` ("apps/infra owns its Stack wiring; import a capability or service contract instead.", `rat-stack/scripts/oxlint-plugin-boundaries.ts:890`). (pack: composition, evidence/FINDINGS.md) Cycle 005, findings 5 and 8.
- Rat Stack publishes its own limits: it has "no fence yet" proving that imports do not deploy resources ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 9), and its website corpus, not its repository, admits that one-line infrastructure removal is unproven for `packages/subscriber-delivery` (finding 12; (pack: composition, evidence/SOURCES.md)). This pack records the same limits below.

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: packages/ledger/src/infra.ts - the service library declaring resources, imported by the Worker
import * as Cloudflare from 'alchemy/Cloudflare'
export const ledgerDb = Cloudflare.D1.Database('ledger-d1', {})

// WRONG: workers/ledger/src/d1-ledger.ts - apps/infra would have to import the workers/ledger application

// RIGHT: packages/ledger-d1/src/D1Ledger.ts - the driver Layer declares what it uses
export const layer = (options: { id: string }) =>
  Layer.unwrap(Effect.gen(function*() {
    const database = yield* Cloudflare.D1.Database(`${options.id}-d1`, { migrations })
    return Layer.succeed(Ledger.Store, makeD1Store(database))
  }))
// apps/infra/alchemy.run.ts and workers/ledger/src/main.ts both import '@scope/ledger-d1' and provide
// D1Ledger.layer({ id: 'ledger' }) with Cloudflare.D1.QueryDatabaseBinding; nothing imports apps/infra.
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-graph` fails any edge into the infrastructure application, because it is a unit of kind `application` (pack: composition, dependency-direction.md).

Gate: none yet for "only applications and driver adapter libraries import `alchemy`" and "one Stack owner". The first would read, from the compiler's import graph, value imports of `alchemy` and `alchemy/*` per unit and fail a library that also declares a `Context.Service` its dependents import (a service library), since a driver adapter library carries no marker of its own; the second would count units containing an Alchemy run file and fail above one. Gate: none yet for "importing an entry deploys nothing"; it would import every application entry in a sandbox with no network and no credentials and fail on any provisioning call.
