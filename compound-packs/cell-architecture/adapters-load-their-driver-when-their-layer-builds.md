---
title: An adapter loads its third-party driver inside its Layer, so the dependency loads only when a program builds that Layer
applies_when:
  - adding or changing an adapter that builds a Layer over a third party's SDK, client or bundler
  - adding a value import of a third-party package to a service module, a package entry or a barrel
  - a process that never uses a service fails, or starts slowly, because importing the package loaded that service's driver
tags: [adapter, driver, layer, dynamic-import, startup, third-party]
---

Always load a third-party driver (an SDK, a network or chain client, a bundler, a WASM module) inside the adapter's Layer constructor with `yield* Effect.promise(() => import('<driver>'))`. Never import it as a top-level value import of the adapter module.

The service module (its `Context.Service` and schemas) refers to the driver's types with `import type` only. Never value-import a driver from a service module, package entry or barrel, and never load one at module top level where a Worker entry reaches it.

This keeps the dependency out of every importer of the service, out of programs that provide a different implementation (a fake, a second adapter), and out of a Worker's startup; it loads once, when the composition root builds the Layer.

```ts
// WRONG: the driver loads whenever anything imports this module
import { createClient } from '@acme/chain-client'
// RIGHT: the adapter loads the driver when its Layer builds
const make = Effect.gen(function*() {
  const { createClient } = yield* Effect.promise(() => import('@acme/chain-client'))
  const client = createClient(yield* ChainStoreConfig)
  yield* Effect.addFinalizer(() => Effect.sync(() => client.destroy()))
  return ChainStore.of({ submit: (s) => submitWith(client, s) })
})
```
