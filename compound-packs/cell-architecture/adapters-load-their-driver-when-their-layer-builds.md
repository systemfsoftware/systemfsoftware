---
title: An adapter loads its third-party driver inside its Layer, so the dependency loads only when a program builds that Layer
applies_when:
  - adding or changing an adapter that builds a Layer over a third party's SDK, client or bundler
  - adding a value import of a third-party package to a service module, a package entry or a barrel
  - a process that never uses a service fails, or starts slowly, because importing the package loaded that service's driver
tags: [adapter, driver, layer, dynamic-import, startup, third-party]
---

A third-party driver (an SDK, a network or chain client, a bundler, a WASM module) is loaded by the adapter's Layer while it builds, with `yield* Effect.promise(() => import('<driver>'))` inside the Layer's constructor effect. It is never a top-level value import of the adapter module. The service module (its `Context.Service` and schemas) refers to the driver's types with `import type` only. That keeps the dependency out of every importer of the service, out of every program that provides a different implementation (a fake, a second adapter), and out of a Worker's global scope. The dependency loads once, when the composition root builds that Layer.

**Decision test.** For each module the diff adds or changes that imports a third-party driver, the rule fails if any of these holds:

- an adapter imports the driver with a top-level value import instead of a dynamic import inside its Layer's constructor;
- a service module, package entry or barrel value-imports a driver (an `import type` is fine);
- the driver is loaded at module top level by anything a Worker entry reaches, outside a Layer.

**Defect it prevents.** A top-level import runs on module load, whether or not the program ever builds the Layer. A process that only needs the service's schemas, or that provides a fake, still loads the driver. It crashes when the driver cannot load in its runtime: a deploy script under Node reached a WASM bundler's `.wasm` import and failed with `Cannot find package 'gojs'`. In a Worker, every top-level load counts against the startup limit on every isolate start.

```ts
// WRONG: the driver loads whenever anything imports this module
import { createClient } from '@acme/chain-client'

export const ChainStore = { layer: Layer.effect(ChainStore, Effect.sync(() => make(createClient(url)))) }
```

```ts
// RIGHT: the service names the driver's types only; the adapter loads the driver when its Layer builds
// chain-store.ts
import type { ChainClient } from '@acme/chain-client'

// acme-chain-store.ts
const make = Effect.gen(function*() {
  const { createClient } = yield* Effect.promise(() => import('@acme/chain-client'))
  const client = createClient(yield* ChainStoreConfig)
  yield* Effect.addFinalizer(() => Effect.sync(() => client.destroy()))
  return ChainStore.of({ submit: (s) => submitWith(client, s) })
})
export const layer = Layer.effect(ChainStore, make)
```

**Source.** The owner's reference project, identity-backend-community, does exactly this.

- `packages/lib/statement-store/src/live.ts` (commit 289d47a80) loads `@novasamatech/sdk-statement` and `@polkadot-api/substrate-client` with `yield* Effect.promise(() => import(...))` inside the `make` effect that `StatementStoreLive` builds with `Layer.scoped`.
- Its `index.ts`, the service and its schemas, imports both packages with `import type` only.

Cloudflare Workers limits, "Worker startup time": "A Worker must parse and execute its global scope (top-level code outside of handlers) within 1 second ... To reduce startup time, avoid expensive work in global scope" (https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time). Adapter naming is `adapters-are-named-for-their-driver.md` in this pack, and where Layers are provided is `services-are-provided-once-at-the-composition-root.md`.

Gate: judge
