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

### 1. The three lineage mechanisms for handle state

A handle record is transparent data by default; encapsulation is opt-in per field:

| Mechanism                   | Shape                                                   | Use when                                                                                                   | Lineage evidence (`repos/effect`)            |
| :-------------------------- | :------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------- |
| Nominal branding            | `readonly [TypeId]: typeof TypeId`                      | Always; identity and forgery resistance, not secrecy                                                       | `Fiber.ts`, `Queue.ts`, `Socket.ts`          |
| Readonly opaque-typed field | `readonly ref: MutableRef.MutableRef<A>`                | The token is Effect-owned and its only escapes are Effect-shaped (`unsafe*`-named)                         | `Ref.ts` publishes its raw mutable container |
| Module-private symbol slot  | `readonly [DriverId]: RawDriver`, symbol never exported | The token is a third-party imperative object whose public methods bypass your error and lifecycle channels | stronger form of the `TypeId` pattern        |

```ts
// RIGHT: third-party driver in a module-private symbol slot
const DriverId: unique symbol = Symbol.for('~my-org/package/RunningInstance/driver')

export interface RunningInstance extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [DriverId]: RawDriver // unnameable and unreachable from consumer code
  readonly id: string
}

// WRONG: publishing the third-party object as a plain readonly field
export interface RunningInstance extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly driver: RawDriver // consumer calls driver.stop() behind your back
}

// WRONG: module-level registry hiding the leak in global state
const drivers = new WeakMap<RunningInstance, RawDriver>() // second source of truth; forbidden
```

### 2. Services get closure scope; handles get symbol slots

A service record is a dictionary of closures, so its private state lives in the closure scope of its factory (`make`), created per acquisition and never visible on any record:

```ts
// RIGHT: per-instance state as Ref inside the service factory (closure scope)
const make = Effect.gen(function*() {
  const batchSizeRef = yield* Ref.make(initialBatchSize) // dies with the Layer
  const tryConsume = (key: string) => Effect.gen(function*() { ... yield* Ref.update(batchSizeRef, ...) })
  return { tryConsume }
})
export class RateLimiter extends Context.Service<RateLimiter, RateLimiter.Definition>() {
  static readonly Default = Layer.scoped(RateLimiter, make)
}
```

Gate: `review` — verify per-instance state travels inside the instance (symbol slot, opaque field, or factory closure), third-party drivers are never public record fields, and no module-level mutable registry exists.
