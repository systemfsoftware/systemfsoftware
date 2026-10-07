---
title: A store's decision-serving reads and saves are operations on a unit handle that only the store's unitOfWork mints
applies_when:
  - declaring a store port whose reads feed a decision that the store then saves
  - writing a store adapter that opens transactions
  - calling store reads or saves from a cell
tags: [cell, store, unit-of-work, handle, compile-time-safety, tstyche]
---

An open unit of work is a live transaction: an ephemeral value bound to a scope, which makes it a handle (`resource-vs-handle-duality`), never a `Context.Service`. A store's decision-serving reads and saves are dual operations on that handle, and the store port exposes one operation, `unitOfWork`, which is the only place a real unit is minted.

A written rule that says "call this inside a transaction" loses data the first time someone forgets it. With reads and saves on the handle, a read or save with no unit does not typecheck, and there is nothing to provide by hand. A marker service in `R` does neither: any code can provide it, nested units shadow one another, and the adapter needs a run-time check to catch a forged one. The unit lives on the store port because only the adapter that owns the database session can open the transaction its queries run in (drizzle's Effect session does not join an ambient `SqlClient` transaction).

1. **The handle.** A `*.handle.ts` module mints the unit with `Handle.make<Data, Slot>()(TypeId)`. The slot holds the adapter's reads and writes bound to one transaction, so its type is port-level and adapter-agnostic. `load` and `save` are dual functions that read the slot. The module exports a scoped `open(driver)` for adapters, and the unit closes when that scope does.
2. **The port.** `unitOfWork: <A, E, R>(use: (unit: Unit) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | StoreUnavailable, R>`. Each adapter opens its transaction, opens a unit over it, and retries the whole callback per `store-serializable-unit-of-work`.
3. **The cell is built over one unit.** `placeOrderCell(unit)` binds both its read and its write handlers to the unit it is given, so a cell cannot settle in a different transaction from the one it read in. Free code that calls `load` in one `unitOfWork` and `save` in a second still typechecks; that split is caught by `review`, not the compiler.
4. **A unit that outlives its unit of work dies.** A callback can return the unit. Every operation on a closed unit dies before any query, and the shared law suite asserts it on both adapters (`fake-and-real-store-laws`).
5. **What the types refuse.** The adopting package's TSTyche test shows that the cell exists only over a unit, that `unitOfWork` takes a function of the unit rather than an effect built outside it, and that a record carrying the unit's brand but not its private slot is refused by `load` and `save`.

```ts
// WRONG: the open transaction as an ambient marker service. Any caller can provide
// it, a nested unit shadows the outer one, and the adapter must catch forgeries at run time.
export class UnitOfWork extends Context.Service<UnitOfWork, { readonly open: true }>()('example/UnitOfWork') {}

// RIGHT: settlement-unit.handle.ts mints the unit; operations are duals over its slot.
export const TypeId = Symbol.for('@example/SettlementUnit')
const SettlementUnit = Handle.make<
  Record<never, never>,
  { readonly driver: SettlementUnitDriver; readonly open: Ref.Ref<boolean> }
>()(TypeId)
export type SettlementUnit = Handle.Of<typeof SettlementUnit>
export const isSettlementUnit = SettlementUnit.is
export const open = (driver: SettlementUnitDriver): Effect.Effect<SettlementUnit, never, Scope.Scope> => /* ... */
export const load: {
  (key: OrderKey): (self: SettlementUnit) => Effect.Effect<OrderSnapshot, SettlementFailure>
  (self: SettlementUnit, key: OrderKey): Effect.Effect<OrderSnapshot, SettlementFailure>
} = dual(2, /* ... */)

// SettlementStore.service.ts
export interface SettlementStoreService {
  readonly unitOfWork: <A, E, R>(
    use: (unit: SettlementUnit) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StoreUnavailable, R>
}

// store.unitOfWork((unit) => placeOrderCell(unit).run(request))   compiles
// store.unitOfWork(placeOrderCell(unit).run(request))             no unit to build it from: rejected
// load(key) alone                                                 a function still waiting for a unit
```

Gate: `type-checker` — the adopting package's TSTyche test pins the three refusals above and the accepted form; `handle-definition-stays-private`, `handle-exports-guard`, `kind-file-construction`, and `kind-file-declares-no-service` hold the unit module to the handle kind; `review` catches a load and a save split across two units in free code.
