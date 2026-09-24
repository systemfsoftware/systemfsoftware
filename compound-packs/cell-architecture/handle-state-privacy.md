---
title: Handle state privacy mechanisms versus service closure scope
applies_when:
  - storing per-instance state or third-party driver tokens on handles and services
  - choosing between record fields, the kind slot, closures, and module-level registries
  - reviewing encapsulation of native or third-party runtime objects
tags: [cell, handle, encapsulation, symbol-slots, service-closures]
---

Handles and services both encapsulate **state**; neither encapsulates **behavior**. Operations live as standalone module functions (handles) or as a dictionary of closures over private state (services). What differs is the mechanism by which per-instance state is stored, and the one law every mechanism must satisfy:

> **State lifetime = acquisition lifetime. Storage travels inside the instance.**
> Module-level mutable registries (`WeakMap`, global maps, module `let`) are a second source of truth: shared across every fiber, scope, and test in the process, surviving the instance, and splitting under dual-bundle installs. They are forbidden.

### 1. The three lineage mechanisms for handle state

A handle record is transparent data by default; encapsulation is opt-in per field:

| Mechanism                   | Shape                                                                       | Use when                                                                                                   | Lineage evidence (`repos/effect`)                                 |
| :-------------------------- | :-------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| Nominal branding            | `readonly [TypeId]: typeof TypeId`, attached by `Handle.make`               | Always; identity and forgery resistance, not secrecy                                                       | `Fiber.ts`, `Queue.ts`, `Socket.ts`                               |
| Readonly opaque-typed field | `readonly ref: MutableRef.MutableRef<A>`                                    | The token is Effect-owned and its only escapes are Effect-shaped (`unsafe*`-named)                         | `Ref.ts` publishes its raw mutable container                      |
| Kind slot                   | state passed to `Handle.make<Data, Slot>()(TypeId)`, read via `.slot(self)` | The token is a third-party imperative object whose public methods bypass your error and lifecycle channels | `open-file.handle.ts` keeps `{ driver, cursor }` in the kind slot |

The kind slot replaces the hand-rolled module-private symbol: the slot symbol is not declared by the module, the definition binding that reads it never leaves the module, and `kind-typeid-by-symbol-for` forbids the module from minting any other symbol.

```ts
// RIGHT: the third-party driver travels in the kind's slot
const OpenFileDef = Handle.make<
  { readonly fd: number },
  { readonly driver: Driver; readonly cursor: Ref.Ref<bigint> }
>()(TypeId)

export type OpenFile = Handle.Of<typeof OpenFileDef>
export const isOpenFile = OpenFileDef.is

// The slot is read only through the module-private definition.
const driverOf = (self: OpenFile): Driver => OpenFileDef.slot(self).driver
```

```ts
// WRONG: a hand-rolled slot symbol — kind-typeid-by-symbol-for forbids the extra symbol
const DriverId: unique symbol = Symbol.for('~my-org/package/OpenFile/driver')

export interface OpenFile extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [DriverId]: Driver // nameable by consumers; the kind's slot exists for this
}

// WRONG: publishing the third-party object as a plain readonly field
export interface OpenFile extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly driver: Driver // consumer calls driver.close() behind your back
}

// WRONG: module-level registry hiding the leak in global state
const drivers = new WeakMap<OpenFile, Driver>() // second source of truth; forbidden
```

### 2. Services get closure scope; handles get the kind slot

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

Gate: `handle-definition-stays-private`, `kind-typeid-by-symbol-for`, `kind-file-holds-no-module-state`, `review` — verify per-instance state travels inside the instance (the kind slot, an opaque field, or a factory closure), the definition binding that reads the slot stays module-private, no hand-rolled symbol exists beside the kind's `TypeId`, and no module-level mutable registry exists.
