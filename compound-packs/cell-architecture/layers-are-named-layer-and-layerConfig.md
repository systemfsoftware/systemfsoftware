---
title: A Layer a library exports is named layer or layerConfig, and a name ending in Live exists only at a composition root
applies_when:
  - declaring a Context.Service that carries a static Layer
  - exporting a Layer from an adapter module in a library
  - naming the layers an application wires at its entry point
tags: [service, layer, naming, composition-root]
---

A composition root is the entry module of one process (`main.ts`, a worker's entry, a CLI's bin script); everything else is library code.

In library code, name every static Layer member of a `Context.Service` class and every Layer an adapter module exports `layer` (a function when it takes options) or `layerConfig` (when it reads Config). Never name a library binding `Live`, `*Live`, `Default` or another `layer<Variant>`; a `*Live` name is a binding inside a composition root. Test doubles are never layer members (testing pack: port-fakes-share-a-contract-suite.md).

```typescript
// WRONG, in a library
export const LedgerLive = Layer.effect(Ledger)(make)
// RIGHT, in a library
export const layer = (options: PostgresLedgerOptions) => Layer.effect(Ledger)(make(options))
export const layerConfig = Layer.effect(Ledger)(Effect.flatMap(PostgresLedgerConfig, make))
// main.ts, the composition root
const LedgerLive = PostgresLedger.layer({ schema: 'billing' })
```
