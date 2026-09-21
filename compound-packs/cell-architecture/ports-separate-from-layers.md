---
title: Capability ports must be declared in separate modules from concrete Layer implementations
applies_when:
  - declaring a service tag, port, or capability contract
  - implementing a Layer that satisfies an infrastructure dependency
  - reviewing imports between pure domain code and database drivers
tags: [cell, ports-and-adapters, context-service, layer, dependency-inversion]
---

Capability ports (`Context.Service`) and concrete implementations (`Layer`) represent two distinct architectural concerns and must live in separate modules:

- **Lean Port Declarations**: The port (`Context.Service<Self, Shape>()(...)`) defines the abstract operations required by the domain. It lives in a lightweight, pure declaration module that contains zero imports of database drivers, HTTP clients, or platform runtimes.
- **Adapters at the Infrastructure Boundary**: The concrete implementation (`Layer.effect`, `Layer.succeed`) lives in an adapter module under infrastructure or store directories. It imports the driver (`@effect/sql-pg`, `pglite`) and satisfies the port contract.
- **Inward Import Direction**: Domain workflows and pure cells import only the capability port. They never import concrete layers or driver libraries. The layers are imported and merged solely at the application composition root.
- **Avoid Co-location**: Never export both `Port` and `Port.Live` from the same file. Co-locating the implementation pulls third-party driver dependencies into every caller that only wanted the type contract.

```ts
// WRONG: port and implementation in the same file forces driver imports onto consumers
// ports/LedgerStore.ts
import { PgClient } from '@effect/sql-pg' // Driver leak!
import { Context, Layer } from 'effect'

export class LedgerStore extends Context.Service<LedgerStore, Shape>()('LedgerStore') {}
export const LedgerStoreLive = Layer.effect(LedgerStore, ...)

// RIGHT: separate port declaration from concrete adapter
// File 1: ports/LedgerStore.ts (pure declaration, zero driver imports)
import { Context, Effect } from 'effect'
export class LedgerStore extends Context.Service<LedgerStore, Shape>()('LedgerStore') {}

// File 2: store/LedgerStoreDrizzle.ts (adapter, imported only at root)
import { PgClient } from '@effect/sql-pg'
import { Layer } from 'effect'
import { LedgerStore } from '../ports/LedgerStore.js'
export const LedgerStoreLive = Layer.effect(LedgerStore, ...)
```

Gate: `lint` — import-origin lint forbids importing database drivers or platform modules into port files.
Review: verify port files export no `Layer` values.
