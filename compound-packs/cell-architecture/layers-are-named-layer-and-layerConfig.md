---
title: A Layer a library exports is named layer or layerConfig, and a name ending in Live exists only at a composition root
applies_when:
  - declaring a Context.Service that carries a static Layer
  - exporting a Layer from an adapter module in a library
  - naming the layers an application wires at its entry point
tags: [service, layer, naming, composition-root]
---

A composition root is the entry module of one process (`main.ts`, a worker's entry, a CLI's bin script): it builds the application's layers and runs the program. Everything else is library code.

In library code, every static Layer member of a Context.Service class and every Layer an adapter module exports is named `layer` (a function when it takes options) or `layerConfig` (when it reads Config). No library binding is named `Live`, `*Live`, `Default` or another `layer<Variant>`. A name ending in `Live` is a binding inside a composition root. Where a test double lives is the testing pack's `port-fakes-share-a-contract-suite.md`; a double is never a layer member here.

**Decision test.** List every static Layer member on a Context.Service class and every exported Layer binding the diff adds or renames outside a composition root. The rule fails on any name other than `layer` or `layerConfig`.

**Defect it prevents.** Two vocabularies for one thing. With Effect 4's names a reader at the root knows that `PostgresLedger.layerConfig` reads Config and can fail with a ConfigError when built, and that `PostgresLedger.layer(options)` takes its settings as arguments. `LedgerLive` or `Ledger.Default` says neither, and a library that exports a ready-made `*Live` has chosen the application's wiring for it.

```typescript
// WRONG
// ledger.service.ts
export class Ledger extends Context.Service<Ledger, LedgerShape>()('app/Ledger') {
  static readonly Default = Layer.effect(this)(make)
}
// postgres-ledger.ts, in a library
export const LedgerLive = Layer.effect(Ledger)(make)
```

```typescript
// RIGHT
// postgres-ledger.ts, in a library
export const layer = (options: PostgresLedgerOptions) => Layer.effect(Ledger)(make(options))
export const layerConfig = Layer.effect(Ledger)(Effect.flatMap(PostgresLedgerConfig, make))
// main.ts, the composition root
const LedgerLive = PostgresLedger.layer({ schema: 'billing' })
```

**Source.** Effect 4 migration guide, `migration/services.md` in Effect-TS/effect: "v4 adopts the convention of naming layers with `layer` ... instead of v3's `Default` or `Live`." That guide also allows variant suffixes such as `layerTest`; this pack does not publish any variant besides `layerConfig`.

Gate: judge
