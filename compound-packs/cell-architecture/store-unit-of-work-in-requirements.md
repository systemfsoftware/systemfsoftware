---
title: A store's decision-serving reads and saves require UnitOfWork, and only the store's unitOfWork removes it
applies_when:
  - declaring a store port whose reads feed a decision that the store then saves
  - writing a store adapter that opens transactions
  - calling store reads or saves from a cell
tags: [cell, store, unit-of-work, compile-time-safety, effect-requirements, tstyche]
---

A store's decision-serving reads and saves carry a `UnitOfWork` service in their Effect requirements (`R`). The store's `unitOfWork` combinator is the only thing that removes it. The compiler then rejects every way of running the read-decide-save outside one transaction.

A written rule that says "call this inside a transaction" loses data the first time someone forgets it. Putting the requirement in `R` makes the omission a type error at the call site, and it needs no change to `@systemfsoftware/effect-cell-types`: the unit of work lives on the store port because only the adapter that owns the database session can open the transaction its queries run in.

1. **The port shape.** `load` and `save` return `Effect.Effect<A, E, UnitOfWork>`. `unitOfWork` has the type `<A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | StoreUnavailable, Exclude<R, UnitOfWork>>`. The port exposes this combinator, never a transaction handle.
2. **Three refusals.** These fail to typecheck, naming `UnitOfWork` as the missing service:
   - running the cell without `unitOfWork`;
   - calling `settle` outside one;
   - calling `settle` inside a second `unitOfWork` after the first one did the `load` (the read and the save then sit in different transactions).
3. **Type test.** The adopting package ships a TSTyche test that proves the three refusals and that the accepted form, the whole cell inside one `unitOfWork`, compiles.
4. **The forged-marker gap.** The type does not make `UnitOfWork` unforgeable: code outside the store can `Effect.provideService(UnitOfWork, ...)` by hand. Each adapter closes this at run time: its `load` and `settle` also read a module-private transaction handle that only its own `unitOfWork` provides, and die before any query when it is missing. A lint check for `UnitOfWork` provided outside a store adapter is a filed proposal, not an existing gate.

```ts
// WRONG: nothing in R; the read and the save can run in separate transactions,
// or in none, and the compiler accepts it.
export interface SettlementStoreService {
  readonly load: (key: OrderKey) => Effect.Effect<OrderSnapshot, StoreUnavailable>
  readonly settle: (plan: OrderPlan) => Effect.Effect<void, StoreUnavailable>
}

// RIGHT: load and settle need UnitOfWork; only unitOfWork removes it.
export class UnitOfWork extends Context.Service<UnitOfWork, { readonly open: true }>()('example/UnitOfWork') {}

export interface SettlementStoreService {
  readonly load: (key: OrderKey) => Effect.Effect<OrderSnapshot, CreditAccountNotFound | StoreUnavailable, UnitOfWork>
  readonly settle: (plan: OrderPlan) => Effect.Effect<void, StoreUnavailable, UnitOfWork>
  readonly unitOfWork: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StoreUnavailable, Exclude<R, UnitOfWork>>
}

// store.unitOfWork(placeOrderCell.run(request))   compiles
// placeOrderCell.run(request)                     leaves UnitOfWork in R: rejected at the runtime edge
// store.unitOfWork(store.load(key)).pipe(Effect.flatMap((snapshot) => store.settle(planOf(snapshot))))
//                                                 settle outside the unit: rejected
```

Gate: `type-checker` — the adopting package's TSTyche test rejects the cell run without `unitOfWork`, `settle` outside one, and `settle` in a second unit after the first did the `load`, and accepts the cell inside one `unitOfWork`.
