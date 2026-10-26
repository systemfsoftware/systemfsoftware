---
title: A heavy dependency loads on first use, inside the one service that hands its client only to a use callback
applies_when:
  - importing an SDK, codec, crypto or native package into a module a Worker or an entry point reaches
  - writing a service or Layer that builds a third-party client
  - giving a service's consumers access to a third-party client
tags: [service, layer, dynamic-import, startup, lazy]
---

- A heavy package (an SDK, a codec, crypto or a native binding) has no static value import in any module a Worker or an entry point reaches; `import type` is allowed. Importing a module may cost its declarations and nothing more, and parsing an SDK is a cost.
- The runtime import is `yield* Effect.promise(() => import('pkg'))` inside the service's `make`; never at module scope, and never inside a method that runs on every call.
- When the layer can be built at isolate startup (a Cloudflare Worker gets 1 s of startup CPU), the import and the client build sit inside `Effect.cached`, and the layer body only creates that cached Effect.
- The service exposes `use(f: (client, signal) => Promise<A>): Effect<A, E>`, with `E` the service's own tagged error. No consumer and no other method receives the raw client.
- Teardown is one `Effect.addFinalizer` in `make` that releases the client only if it was built, read from a `Ref`.
- One file holds the one lazy seam for each heavy package; every other module reaches the package through that service.

```typescript
// WRONG
// chain.service.ts
export class Chain extends Context.Service<Chain, ChainShape>()('app/Chain') {}
// heavy-chain.ts
import { createClient } from 'heavy-sdk'

export const layer = Layer.effect(Chain)(Effect.gen(function*() {
  const config = yield* ChainConfig
  const client = createClient(config) // the SDK is parsed the moment a Worker imports this module
  return { client } // every consumer holds the raw client
}))
```

```typescript
// RIGHT
import type { Client } from 'heavy-sdk'

const make = Effect.gen(function*() {
  const config = yield* ChainConfig
  const built = yield* Ref.make(Option.none<Client>())
  const client = yield* Effect.cached(Effect.gen(function*() {
    const { createClient } = yield* Effect.promise(() => import('heavy-sdk'))
    const next = createClient(config)
    yield* Ref.set(built, Option.some(next))
    return next
  }))
  yield* Effect.addFinalizer(() =>
    Ref.get(built).pipe(
      Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: (c) => Effect.sync(() => c.destroy()) })),
    )
  )
  const use = Effect.fn('Chain.use')(function*<A>(f: (client: Client, signal: AbortSignal) => Promise<A>) {
    const ready = yield* client
    return yield* Effect.tryPromise({ try: (signal) => f(ready, signal), catch: (cause) => new ChainError({ cause }) })
  })
  return { use }
})
```

Exemplars, paritytech/identity-backend-community at `968c8d27`: the runtime import inside `make` at `apps/identity-backend/src/infrastructure/adapters/notifications/apn/service.ts:66`, provided through `Layer.effect` at `:221`; `apps/identity-backend/src/infrastructure/adapters/notifications/web/web-push.service.ts:55`; five modules loaded in one service at `apps/identity-backend/src/infrastructure/adapters/blockchain/people-chain-codecs.service.ts:8-20`. All three import in the layer body, so they show clauses 1 and 2, not 3-5.

Which Layer constructors a library ships, and where a service's per-instance state lives: `services-and-layers.md`. Releasing an acquired resource: `scopes-close-at-the-run-edge.md`.

Gate: judge
