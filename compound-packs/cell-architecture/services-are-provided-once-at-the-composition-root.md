---
title: Layers are built and provided once, at the application's composition root, never inside a cell phase, a workflow or a handler
applies_when:
  - providing a service to a cell, a workflow or a route or request handler
  - calling Effect.provide, Layer.build or Cell.provideContext
  - wiring an application's services at its entry point
tags: [service, layer, composition-root, provide]
---

Build the application's layers and supply them once, in the composition root (the entry module of one process): `Effect.provide` on the whole program, or `Layer.build` under the root scope followed by `Cell.provideContext`.

Never call `Effect.provide` with a Layer, `Layer.build` or `Cell.provideContext` anywhere else in source: not in a cell's read or write phase, a workflow, a blueprint target, a service's constructor, or a route or request handler body. A service a cell or handler needs stays in its requirement type for the root to supply. Doing otherwise hides the service from the root and from tests, scatters the wiring, and reopens pools and file handles on every call. How a test supplies services is the testing and configuration packs' business.

```typescript
// WRONG: order-routes.ts
placeOrderCell.run(request).pipe(Effect.provide(PostgresLedger.layer({ schema: 'billing' })))
// RIGHT: order-routes.ts keeps Ledger in the requirement type; main.ts builds it once
const context = yield* Layer.build(LedgerLive)
const placeOrder = Cell.provideContext(placeOrderCell, context)
```
