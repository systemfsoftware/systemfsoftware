---
title: Handle state privacy mechanisms versus service closure scope
applies_when:
  - storing per-instance state or third-party driver tokens on handles and services
  - choosing between record fields, symbol slots, closures, and module-level registries
  - reviewing encapsulation of native or third-party runtime objects
tags: [resource-algebra, handle-state-privacy, encapsulation, symbol-slots, service-closures, effect-style]
---

Handles and services both encapsulate **state**; neither encapsulates **behavior**. Operations live as standalone module functions (handles) or as a dictionary of closures over private state (services). What differs is the mechanism by which per-instance state is stored, and the one law every mechanism must satisfy:

> **State lifetime = acquisition lifetime. Storage travels inside the instance.**
> Module-level mutable registries (`WeakMap`, global maps, module `let`) are a second source of truth: shared across every fiber, scope, and test in the process, surviving the instance, and splitting under dual-bundle installs. They are forbidden.

### 1. The three lineage mechanisms for handle state

A handle record is transparent data by default; encapsulation is opt-in per field:

| Mechanism                                | Shape                                                   | Use when                                                                                                   | Lineage evidence (`repos/effect`)            |
| :--------------------------------------- | :------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------- |
| Nominal branding                         | `readonly [TypeId]: typeof TypeId`                      | Always; identity and forgery resistance, not secrecy                                                       | `Fiber.ts`, `Queue.ts`, `Socket.ts`          |
| Readonly opaque-typed field              | `readonly ref: MutableRef.MutableRef<A>`                | The token is Effect-owned and its only escapes are Effect-shaped (`unsafe*`-named)                         | `Ref.ts` publishes its raw mutable container |
| Module-private / `@internal` symbol slot | `readonly [DriverId]: RawDriver`, symbol never exported | The token is a third-party imperative object whose public methods bypass your error and lifecycle channels | stronger form of the `TypeId` pattern        |

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

The distinction between the two field forms is ownership: `MutableRef` admits only Effect-shaped escapes, so publishing it loses nothing. A third-party driver (`stop()`, `destroy()`, imperative `exec()`) published as a field is an unmanaged escape hatch; the sanctioned escape is a single mediated combinator (`use(self, f)`) that wraps the raw call in `Effect.tryPromise` with typed cause preservation.

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
  static readonly Default = Layer.scoped(RateLimiter, make) // static member is a dictionary, not state
}
```

`static readonly Default` layer members are dictionaries (definitions), not per-instance state; the state is the `Ref` bound inside `make`. Evidence: `paritytech/identity-backend-community` (`invitation-ticket-pool.shell.ts`, `token-bucket-rate-limiter.service.ts`) holds every mutable per-instance value as `Ref.make`/`SynchronizedRef.make` inside `make`, and reaches for `Layer.fresh` when a second instance of a service is needed — the identity-collision pain that motivates modeling running instances as handles instead.

### 3. Decision rule

1. Immutable after acquisition and Effect-owned → readonly opaque-typed field.
2. Immutable after acquisition and third-party → module-private symbol slot plus one mediated escape combinator.
3. Mutable per instance, service → `Ref`/`SynchronizedRef` inside `make`, captured by closures.
4. Mutable per instance, handle → readonly `Ref` field or symbol slot on the record; still never module state.
5. Anything else (WeakMap, global map, module `let`) → refuse.

Gate: `review` — verify per-instance state travels inside the instance (symbol slot, opaque field, or factory closure), that third-party drivers are never public record fields, and that no module-level mutable registry exists.
