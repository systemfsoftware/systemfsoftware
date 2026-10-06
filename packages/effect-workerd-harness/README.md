# @systemfsoftware/effect-workerd-harness

Run a bundled Worker in real workerd as a scoped Effect resource.

A test bundles a Worker entry with `bundle`, hands the modules to `layer(options)`, and calls the
Worker through the `Harness` service while the scope is open. Closing the scope disposes the
runtime, and any later call answers a typed `HarnessClosed` error.

## Usage

```ts
import { bundle, Harness, layer } from '@systemfsoftware/effect-workerd-harness'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  const worker = yield* bundle(new URL('./echo.worker.ts', import.meta.url).pathname)
  return yield* Effect.scoped(
    Effect.gen(function*() {
      const harness = yield* Harness
      const response = yield* harness.dispatchFetch('http://harness/echo', { method: 'POST', body: 'hello' })
      return yield* Effect.promise(() => response.text())
    }).pipe(Effect.provide(layer({ worker }))),
  )
})
```

## Options

- `worker` — a `BundledWorker` from `bundle`, or a raw module source string.
- `durableObjects` — Durable Object classes exported by the Worker's module, each with its storage.
- `bindings` — `PlainText`, `DurableObject`, `WorkerLoader` and `Service` bindings for the Worker's `env`.
- `services` — sibling Workers a `Service` binding can address.
- `fetchTriggers` — fetch patterns that route `dispatchFetch` when sibling Workers are present.
- `name`, `compatibilityDate`, `compatibilityFlags` — the Worker's identity and compatibility.

The service exposes `dispatchFetch` and `service(name)`, which answers a typed service binding.
