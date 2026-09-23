---
title: A store must declare its consistency and commutativity laws through an executable law suite
applies_when:
  - authoring or reviewing a store port or adapter interface
  - defining shared persistence contracts across cell boundaries
  - declaring atomic boundaries and consistency guarantees for shared state
tags: [cell, store, persistence, laws, consistency, boundary]
---

A store is a port over shared state that outlives one interaction. A port without an executable law suite is not a store; other store rules and store-issued proof requirements do not apply to it.

A store formally declares the laws its operations obey by shipping a shared law contract suite in `tests/` that both its in-memory fake and real database adapters pass:

1. **State Longevity and Scope**: A store manages state whose lifecycle spans multiple independent cell invocations or concurrent requests.
2. **Mandatory Base Laws**: Every store's law suite must test and prove at least three fundamental algebraic properties:
   - **Read-after-write**: Reading a key immediately following a successful save returns the value written.
   - **Repeated read stability**: Repeating a read without intervening writes yields identical state and causes no mutations.
   - **Commutativity of disjoint keys**: Operations addressing independent keys commute; their execution order does not affect final observed state.
3. **Write Semantics**: A store supporting blind writes adds last-write-wins. A store providing conditional writes adds mutual exclusion: when two concurrent writes present the same observed version, exactly one applies and the other is rejected as a conflict.

```ts
// WRONG: Port declared by its role or comments with no executable laws
export interface UserPreferenceStore {
  // Concurrency is unstated; adapters can drift or silently overwrite
  readonly get: (userId: string) => Effect.Effect<Preferences>
  readonly set: (userId: string, prefs: Preferences) => Effect.Effect<void>
}

// RIGHT: the port names its operations; tests/settlement-store.integration.test.ts runs
// the same fixed histories against SettlementStore.memory(seed) and SettlementStore.Live
export interface SettlementStoreService {
  readonly readCredit: (customerId: string) => Effect.Effect<CreditObservation, CreditAccountNotFound>
  readonly readAllStock: Effect.Effect<StockObservation>
  readonly settle: (command: SettlementCommand) => Effect.Effect<'Committed' | 'Conflict'>
}
```

Gate: `review` — verify that any port identified as a store manages shared state across interactions, defines formal consistency guarantees, and ships a shared law suite in `tests/` covering read-after-write, read stability, and key commutativity.
