---
title: The mutable state of a service, adapter, blueprint or handle is created inside its constructor, never at module scope
applies_when:
  - keeping a cache, counter, registry or connection table inside a service, adapter, blueprint or handle
  - adding a module-level let, var, Map, Set, WeakMap or Ref to a library module
tags: [service, state, module-scope, layer, handle]
---

Create the state an instance reads and writes (a cache, a counter, a table of open connections) inside the Effect that builds the instance: the service's `make`, the Layer's constructor, the blueprint's scoped target, or the code that mints the handle. Each build then owns its own state, so two tests in one worker or two tenants never share it.

A library module holds no module-level `let` or `var`, and no module-level `const` bound to a mutable container (Map, Set, WeakMap, Ref, MutableRef, or an array or object written later). Immutable module-level values (a schema, a frozen lookup table, a constant) are fine, and a composition root's own values are outside this rule.

```typescript
// WRONG: shared by every instance
const entries = new Map<CacheKey, CacheEntry>()
// RIGHT
export const make = Effect.sync(() => {
  const entries = new Map<CacheKey, CacheEntry>() // one per built layer
  return { get: (key: CacheKey) => Effect.sync(() => Option.fromNullishOr(entries.get(key))) }
})
```
