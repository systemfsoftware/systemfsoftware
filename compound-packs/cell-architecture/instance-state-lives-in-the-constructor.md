---
title: The mutable state of a service, adapter, blueprint or handle is created inside its constructor, never at module scope
applies_when:
  - keeping a cache, counter, registry or connection table inside a service, adapter, blueprint or handle
  - adding a module-level let, var, Map, Set, WeakMap or Ref to a library module
tags: [service, state, module-scope, layer, handle]
---

State an instance reads and writes (a cache, a counter, a table of open connections) is created inside the Effect that builds the instance: the service's `make`, the Layer's constructor, the blueprint's scoped target, or the code that mints the handle. Each build then owns its own. A library module holds no module-level `let` or `var`, and no module-level `const` bound to a mutable container (a Map, Set, WeakMap, Ref or MutableRef, or an array or object written later). Immutable module-level values (a schema, a frozen lookup table, a constant) are not state. A composition root's own module-level values are outside this rule.

**Decision test.** For each module-level binding the diff adds to a library module, the rule fails when it is a `let` or `var`, or a `const` whose value is a mutable container that any function in the module writes.

**Defect it prevents.** Two instances built in one process share the state. Two tests in the same worker see each other's cache entries, two layers built for two tenants serve one tenant's data to the other, and a runtime that reuses a loaded module across requests carries one request's state into the next.

```typescript
// WRONG
// memory-cache-store.ts
const entries = new Map<CacheKey, CacheEntry>()
export const make = Effect.sync(() => ({
  get: (key: CacheKey) => Effect.sync(() => Option.fromNullishOr(entries.get(key))),
}))
```

```typescript
// RIGHT
export const make = Effect.sync(() => {
  const entries = new Map<CacheKey, CacheEntry>() // one per built layer
  return {
    get: (key: CacheKey) => Effect.sync(() => Option.fromNullishOr(entries.get(key))),
  }
})
```

**Source.** The cell-architecture lint rule `kind-file-holds-no-module-state` reports the same thing in `*.blueprint.ts` and `*.handle.ts` files; this rule carries it to every library module. The @systemfsoftware/effect-cell-types README's quick start creates its in-memory Map inside the Layer's constructor.

Gate: judge
