---
title: Handle state privacy mechanisms versus service closure scope
applies_when:
  - storing per-instance state or third-party driver tokens on handles and services
  - choosing between record fields, symbol slots, closures, and module-level registries
  - reviewing encapsulation of native or third-party runtime objects
tags: [cell, handle, encapsulation, symbol-slots, service-closures]
---

Handles and services both encapsulate **state**; neither encapsulates **behavior**. Operations live as standalone module functions (handles) or as a dictionary of closures over private state (services). What differs is the mechanism by which per-instance state is stored, and the one law every mechanism must satisfy:

> **State lifetime = acquisition lifetime. Storage travels inside the instance.**
> Module-level mutable registries (`WeakMap`, global maps, module `let`) are a second source of truth: shared across every fiber, scope, and test in the process, surviving the instance, and splitting under dual-bundle installs. They are forbidden.

### 1. The kind owns the handle's state

A handle is transparent data plus one private slot. `Handle.make` mints both, so no handle file declares its own `TypeId`, driver symbol, or guard:

| State         | Where it lives                                             | Who can read it                                                                   |
| :------------ | :--------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| Brand         | the kind's `TypeId` on every handle; `Def.is(u)` checks it | anyone; identity, not secrecy                                                     |
| Data          | plain readonly fields `create` returns                     | anyone; the kind refuses data holding a function or the driver                    |
| Driver        | a slot keyed by a symbol `effect-cell-types` never exports | only the definition's own operations, streams, children, release, and integration |
| Released flag | the same private slot                                      | only the kind; an operation that finds it set dies with `HandleReleased`          |

A third-party driver's public methods (`stop()`, `kill()`) bypass your error and lifecycle channels. The driver therefore arrives only as the first parameter of a function written inline in the `Handle.make` call, and it may appear there in three positions:

- the head of a member chain that ends in a call other than `bind`: `sandbox.exec(cmd)`;
- a member chain, never the bare driver, as the first argument of an `effect` `Ref` read or write: `Ref.get(driver.cursor)`;
- inside `integration`, a call argument, bare or as a member chain: `Layer.succeed(Driver, sandbox)`.

Any function between the reference and the definition function must be written inline as an argument, or as a property of an object-literal argument, to a call from the `effect` package: `Effect.flatMap(x, (v) => sandbox.read(v))`, `Effect.tryPromise({ try: () => sandbox.stop() })`. Effect never hands those functions to caller code. A named local function or a function passed to any other call is reported.

```ts
// RIGHT: the driver stays inside the definition's own operation
operations: {
  exec: (sandbox, _vm, cmd: string) => Effect.tryPromise(() => sandbox.exec(cmd)),
}

// WRONG: lending the driver to caller code through a callback
operations: {
  use: (sandbox, _vm, f: (s: Sandbox) => Promise<A>) => Effect.tryPromise(() => f(sandbox)),
}

// WRONG: a module-level registry holding drivers beside the instances
const drivers = new WeakMap<RunningVM, Sandbox>() // second source of truth; forbidden
```

**Unenforced guidance.** A driver method whose own result controls the driver (a method returning a handle to the same process, say) passes both the kind's types and the confinement rule. No instrument sees it; review keeps such results out of operation outputs.

```ts
// WRONG (passes types and lint): the result of `sandbox.process()` can stop the sandbox
operations: {
  process: ;
  ;((sandbox) => Effect.sync(() => sandbox.process()))
}

// RIGHT: project the result to data before it leaves the operation
operations: {
  pid: ;
  ;((sandbox) => Effect.sync(() => sandbox.process().pid))
}
```

### 2. Services get closure scope

A service record is a dictionary of closures, so its private state lives in the closure scope of its factory, created per acquisition and never visible on any record:

```ts
// RIGHT: per-instance state as Ref inside the service factory (closure scope)
const make = Effect.gen(function*() {
  const batchSizeRef = yield* Ref.make(initialBatchSize) // dies with the Layer
  const tryConsume = (key: string) => Effect.gen(function*() { ... yield* Ref.update(batchSizeRef, ...) })
  return { tryConsume }
})
export class RateLimiter extends Context.Service<RateLimiter, RateLimiter.Definition>() {
  static readonly Default = Layer.effect(RateLimiter, make)
}
```

Gate: `Handle.make` refuses handle data, operation results, stream elements, and callback arguments that can hold the driver, and integration outputs that are not class-declared services or can hold it (`pnpm --filter @systemfsoftware/effect-cell-types test:types`). `@systemfsoftware/oxlint-plugin-cell-architecture` rules `handle-driver-confinement` (driver positions, `effect` callbacks, inline definition functions) and `kind-file-holds-no-module-state` (no module-level `let`, `var`, mutable collection, or `Ref` in a resource or handle file). Driver results that control the driver are unenforced: `review`.
