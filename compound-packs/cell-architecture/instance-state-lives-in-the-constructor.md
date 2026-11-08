---
title: Mutable state belongs to its instance, never to a module
applies_when:
  - adding a cache, counter, registry, connection, client or memo table
  - declaring module-level state in a library, application or composition root
  - carrying request context into a callback
  - choosing a representation for service-owned state or its transitions
tags: [cell, state, module-scope, layer, request-context]
---

Make each stateful capability a `Context.Service` whose implementation a Layer builds and the composition root provides once. This includes caches, memo tables, registries, counters, clients, connections, pools, formatters and lookup tables built at runtime, and request-scoped values. Follow (pack: cell-architecture, services-are-provided-once-at-the-composition-root.md), (pack: cell-architecture, layers-are-named-layer-and-layerConfig.md) and (pack: cell-architecture, scopes-close-at-the-run-edge.md).

Choose the tool by the state it owns. Model named states with transitions, including lifecycles, protocols, workflows, retry or backoff and connection states, as an `@systemfsoftware/xstate` machine whose actor the Layer-built service owns within its scope; never hand-roll one with a status field. For a plain observable value store with subscriptions and no named-state transitions, use `@systemfsoftware/xstate-store`, owned by the Layer-built service. For a keyed table or counter with neither named-state transitions nor subscriptions, use a `Ref` or `Map` inside the Layer-built service.

Module-level state is a top-level binding or module-retained closure whose binding, reachable properties, collection entries or captured data can change after module evaluation. Never declare top-level `let` or `var`, a mutable `Map`, `Set`, `WeakMap`, `WeakSet`, array, object, `Ref`, client or stateful class instance, or a lazy closure that retains a value. Weak keys do not change the lifetime rule.

Module-level `const` may hold an immutable value, a pure function without mutable captures, or an inert Schema or Layer description. Deeply immutable means no reachable data or captured state can change through any retained reference; `readonly` and a shallow `Object.freeze` do not prove it. A function may build a fresh immutable table on each call without retaining it. A `Context.Service` key is an identity, not a service instance; a `Context.Reference` default retaining mutable state is not exempt.

Build resources that need acquisition and release, such as clients, sockets and pools, with `Layer.effect` inside the scope so their release is bound to that scope. Read application settings from the feature configuration service; only library-adapter Layer options may receive configuration explicitly (pack: configuration, settings-reach-code-through-context.md).

A cache is storage filled lazily on demand and reused across calls, such as a memo table, read-through map or computed-result map; a table fully built when its Layer is built and never grown afterwards is not a cache and needs no cache evidence. A cache is justified only by all three, in order: a stated production latency, throughput or cost budget; production telemetry or a production-representative load measurement showing the uncached path misses it; and a measurement showing the cached path meets it under the same load. A benchmark speedup alone, faster tests or CI, or “it is faster” is not evidence. Even then, the cache belongs to the cell's scoped service or `Ref`, with its lifetime bound to the scope, never to the module. For slow properties, see (pack: schema-modelling, diagnose-slow-properties-before-optimizing.md).

The only mutable module-scope exception is an `AsyncLocalStorage` carrying request context across a callback boundary whose signature this repository does not own and cannot change: a third-party library or runtime invokes our callback outside any Effect context and provides no parameter or context slot for the value. Demonstrate the use by citing the external API's package, version, symbol and callback signature showing the absent slot, identifying carrier lifetime and cleanup, and demonstrating request isolation. A boundary between functions this repository owns never qualifies, however many files explicit parameters or an Effect service would touch.

```typescript
// WRONG: shared memo state, even with weak keys; our own handlers can pass the ID
const cache = new Map<string, string>()
const byCaller = new WeakMap<object, string>()
const userId = new AsyncLocalStorage<string>()
const ownHandler = () => nextHandler(userId.getStore())

// RIGHT: immutable declarations; the Layer builds one formatter map per service instance
const labels = Object.freeze({ ok: 'ok' })
const makeLabels = () => Object.freeze({ ok: 'ok' })
class ZoneFormatters extends Context.Service<ZoneFormatters, {
  readonly format: (zone: string, instant: number) => string | undefined
}>()('ZoneFormatters') {}
const layer = Layer.effect(ZoneFormatters)(Effect.sync(() => {
  const formats = new Map([['UTC', new Intl.DateTimeFormat('en', { timeZone: 'UTC' })]])
  return ZoneFormatters.of({ format: (zone, instant) => formats.get(zone)?.format(instant) })
}))

// RIGHT only when lifetime, cleanup and request isolation are demonstrated:
// Node.js v24.22.2, node:util inspect.custom(depth, opts, inspect) has no context slot:
// https://nodejs.org/docs/v24.22.2/api/util.html#custom-inspection-functions-on-objects
const requestId = new AsyncLocalStorage<string>()
const logValue = { [inspect.custom]: (_depth: number, _opts: unknown, _inspect: unknown) => requestId.getStore() }
```
