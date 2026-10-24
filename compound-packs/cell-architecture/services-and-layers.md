---
title: A library ships only layer and layerConfig constructors, and services are bound once at the application's composition root
applies_when:
  - declaring a Context.Service or adding a Layer to a service class or an adapter
  - providing services to a cell, a workflow or a request handler
  - passing configuration or a runtime environment into a library
tags: [service, layer, composition-root, config]
---

- The only Layer members on a Service class are `layer` and `layerConfig`; never `Live`, `Default`, `layerTest`, `layerNoop`, `layerMock` or another variant.
- A library's adapter exports its Layer as `layer` (a function when it takes options) and as `layerConfig` when it reads Config. A library never exports a `*Live` or `Default`; a `*Live` name exists only at an application's composition root.
- A Layer is built and provided once, at the application's composition root; never `Effect.provide(layer)`, `Layer.build` or `Cell.provideContext` inside a cell phase, a workflow, or a route or request handler body.
- A service's per-instance state lives in its `make` closure, never at module scope (a module-level `let`, `Map`, `WeakMap` or `Ref`).

```typescript
// WRONG
// ledger.service.ts
export class Ledger extends Context.Service<Ledger, LedgerShape>()('app/Ledger') {
  static readonly layerTest = Layer.succeed(this)(fakeLedger)
}
// postgres-ledger.ts, in a library
export const LedgerLive = Layer.effect(Ledger)(make)
```

```typescript
// RIGHT
// postgres-ledger.ts, in a library
export const layer = (options: PostgresLedgerOptions) => Layer.effect(Ledger)(make(options))
// main.ts, the application's composition root
const LedgerLive = PostgresLedger.layer({ schema: 'billing' })
```

Gate: judge
