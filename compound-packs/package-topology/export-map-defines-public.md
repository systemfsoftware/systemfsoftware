---
title: The export map and the forgotten-export check define what is public, not folder names
applies_when:
  - adding a published function whose signature mentions a type from another module
  - moving a module into or out of an internal folder
  - re-exporting a previously internal symbol from mod.ts
  - changing what a package's root entry exports
tags: [package-topology, export-map, internal, api-extractor, forgotten-export]
---

What a consumer can import is what the export map lists. What a consumer can name is what the entry modules re-export. A folder called `internal/` decides neither.

A published signature that mentions a type the entry does not export hands consumers a value they cannot name: they cannot annotate it, store it, or pass it on. api-extractor reports this as `ae-forgotten-export`, set to `error` in every package's `api-extractor.json` and run by `api:check`. Either export the type or replace it in the signature with a published one.

A module belongs in `internal/` when nothing the package re-exports from its entries constructs, composes, decodes, dispatches, or provides it. Decide that from the package's own entry modules; no workspace search is needed.

```ts
// WRONG: published signature returns an internal type
// src/mod.ts
export const load: (id: OrderId) => Effect.Effect<OrderRow> // OrderRow lives in src/internal/row.ts, not re-exported

// RIGHT: the signature returns the published Order type
export const load: (id: OrderId) => Effect.Effect<Order>
```

Gate: `api:check` (api-extractor `ae-forgotten-export`, error); `review` for the `internal/` placement.
