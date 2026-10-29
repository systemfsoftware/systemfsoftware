---
title: Layers are built and provided once, at the application's composition root, never inside a cell phase, a workflow or a handler
applies_when:
  - providing a service to a cell, a workflow or a route or request handler
  - calling Effect.provide, Layer.build or Cell.provideContext
  - wiring an application's services at its entry point
tags: [service, layer, composition-root, provide]
---

The composition root (the entry module of one process) builds the application's layers and supplies them once: `Effect.provide` on the whole program, or `Layer.build` under the root scope followed by `Cell.provideContext`. `Effect.provide` with a Layer, `Layer.build` and `Cell.provideContext` appear nowhere else in source: not in a cell's read or write phase, a workflow, a blueprint target, a service's constructor, or a route or request handler body. A service that a cell or handler needs stays in its requirement type for the root to supply. Test files are outside this rule; how a test supplies services is the testing and configuration packs' rule.

**Decision test.** Search the diff's non-test source for `Effect.provide` given a Layer, `Layer.build` and `Cell.provideContext`. The rule fails when any of them sits in a module other than a composition root.

**Defect it prevents.** A layer provided inside a handler, phase or workflow removes that service from the requirement type, so neither the composition root nor a test can choose its implementation, and the wiring is scattered instead of visible in one place. `Layer.build` or `Cell.provideContext` there builds the services in that call's scope, so a connection pool or file handle the layer opens is opened and closed on every call instead of once.

```typescript
// WRONG
// order-routes.ts
export const placeOrder = (request: PlaceOrderRequest) =>
  placeOrderCell.run(request).pipe(Effect.provide(PostgresLedger.layer({ schema: 'billing' })))
```

```typescript
// RIGHT
// order-routes.ts: Ledger stays in the requirement type
export const placeOrder = (request: PlaceOrderRequest) => placeOrderCell.run(request)
// main.ts, the composition root
const LedgerLive = PostgresLedger.layer({ schema: 'billing' })
const main = Effect.gen(function*() {
  const context = yield* Layer.build(LedgerLive)
  const placeOrder = Cell.provideContext(placeOrderCell, context)
  // serve requests with placeOrder.run
})
```

**Source.** @systemfsoftware/effect-cell-types README, "Services": "Build the services once, where your program starts ... The context is not rebuilt on each run, so a scoped resource (a connection pool, a file handle) opens once"; its `Cell.provideContext` doc: "The composition root builds the context once ... so nothing is rebuilt per run." Effect 4 migration guide, `migration/layer-memoization.md`: composing layers and providing once "lets you see the full structure in one place".

Gate: judge
