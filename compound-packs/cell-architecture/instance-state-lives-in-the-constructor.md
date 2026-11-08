---
title: Mutable state belongs to its instance, never to a module
applies_when:
  - adding a cache, counter, registry, connection, client or memo table
  - declaring module-level state in a library, application or composition root
  - carrying request context into a callback
  - choosing a representation for service-owned state or its transitions
tags: [cell, state, module-scope, layer, request-context]
---

Make each stateful capability a `Context.Service` whose implementation a Layer builds and the composition root provides once. This includes caches, memo tables, registries, counters, clients, connections, pools, formatters and lookup tables built at runtime. A request-scoped value is never held by a process-lived service: pass it as an explicit parameter between functions this repository owns, and never store the current request's value in a shared service `Ref`. A runtime-built lookup table gets its contents from executed code rather than a literal. A formatter or other value built and discarded within one call is not state; if a non-request-scoped value is retained and reused across calls, it is state owned by the Layer-built service. Follow (pack: cell-architecture, services-are-provided-once-at-the-composition-root.md), (pack: cell-architecture, layers-are-named-layer-and-layerConfig.md) and (pack: cell-architecture, scopes-close-at-the-run-edge.md).

Choose the tool by the state it owns. Model named states with transitions, including lifecycles, protocols, workflows, retry or backoff and connection states, as an `@systemfsoftware/xstate` machine whose actor the Layer-built service owns within its scope; never hand-roll one with a status field. For a plain observable value store with subscriptions and no named-state transitions, use `@systemfsoftware/xstate-store`, owned by the Layer-built service. The fork's packages are not published to npm; a repository consumes them through a `github:systemfsoftware/xstate` flake input exposed as a pnpm `file:` catalog entry, never by an npm version range. For mutable keyed state or a counter with neither named-state transitions nor subscriptions, use an Effect `Ref` inside the Layer-built service. A `Map` is allowed only when fully built during Layer construction and never mutated afterwards.

Module-level state is a top-level binding or module-retained closure whose binding, reachable properties, collection entries or captured data can change after module evaluation. Never declare top-level `let` or `var`, a mutable `Map`, `Set`, `WeakMap`, `WeakSet`, array, object, `Ref`, client or stateful class instance, or a lazy closure that retains a value. Weak keys do not change the lifetime rule.

Module-level `const` may hold a deeply immutable value, a pure function without mutable captures, or an inert Schema or Layer description. A deeply immutable value is a primitive, or an `Object.freeze`d object or array whose every reachable property is itself deeply immutable. `Map` and `Set` are never immutable, even when frozen; a module-level table must be a deeply frozen object or array. A module-level `const table = buildTable()` is allowed only when the result is deeply immutable, never when it is a `Map`. A function may build a fresh immutable table on each call without retaining it. A `Context.Service` key is an identity, not a service instance; a `Context.Reference` default retaining mutable state is not exempt.

Build resources that need acquisition and release, such as clients, sockets and pools, with `Layer.effect` inside the scope so their release is bound to that scope. Read application settings from the feature configuration service; only library-adapter Layer options may receive configuration explicitly (pack: configuration, settings-reach-code-through-context.md).

A cache is storage filled lazily on demand and reused across calls, such as a memo table, read-through map or computed-result map; a table fully built when its Layer is built and never grown afterwards is not a cache and needs no cache evidence. A cache is justified only by all three, in order: a stated production latency, throughput or cost budget; production telemetry or a production-representative load measurement showing the uncached path misses it; and a measurement showing the cached path meets it under the same load. A benchmark speedup alone, faster tests or CI, or “it is faster” is not evidence. Even then, the cache belongs to the cell's scoped service or `Ref`, with its lifetime bound to the scope, never to the module. For slow properties, see (pack: schema-modelling, diagnose-slow-properties-before-optimizing.md).

The only mutable module-scope exception is an `AsyncLocalStorage` carrying request context across a callback boundary whose signature this repository does not own and cannot change: a third-party library or runtime invokes our callback outside any Effect context and provides no parameter or context slot for the value. Directly above the declaration, write a code comment citing the external API's package, version, symbol and callback signature showing the absent slot, identifying carrier lifetime and cleanup, and demonstrating request isolation. A boundary between functions this repository owns never qualifies, however many files explicit parameters or an Effect service would touch.

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
```
