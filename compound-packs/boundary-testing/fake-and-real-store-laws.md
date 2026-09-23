---
title: Fake and real store adapters must satisfy an identical contract suite of declared store laws
applies_when:
  - implementing in-memory test doubles or fakes for store interfaces
  - verifying real database adapters (e.g. Postgres, SQLite, Drizzle) against store contracts
  - authoring integration tests in tests/ for store persistence
tags: [boundary, store, laws, contract-test, fakes, integration]
---

A store is a capability port over shared state that outlives a single interaction. Every port managing persistent shared state must ship a shared law contract test suite that both its in-memory fake and real database adapters pass.

A test double that diverges from real database semantics invalidates all higher-level tests relying on it (James Shore, _Testing Without Mocks_; https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks). A fake store must not be a bespoke mock configured with canned return values. It is a stateful in-process implementation obeying the exact same transactional, consistency, and commutativity laws as production adapters:

1. **Shared In-Process Law Suite**: The contract suite lives outside `src/` as a `*.integration.test.ts` file (e.g. `tests/settlement-store.integration.test.ts`). It executes against both the in-memory fake (e.g. `SettlementStore.memory`) and the production adapter running on an embedded engine (e.g. `SettlementStore.Live` over PGlite).
2. **Mandatory Algebraic Base Laws**: Every store's law suite must test and prove at least three properties:
   - **Read-after-write**: Reading a key immediately following a successful save returns the value written.
   - **Repeated read stability**: Repeating a read without intervening writes yields identical state and causes no mutations.
   - **Commutativity of disjoint keys**: Operations addressing independent keys commute; their execution order does not affect final observed state.
3. **Write Semantics**: A store supporting blind writes adds last-write-wins. A store providing conditional writes adds mutual exclusion: when two concurrent writes present the same observed version, exactly one applies and the other is rejected as a conflict.
4. **Zero Subprocess Spawning**: The suite runs entirely in-process without spawning external database daemon processes or docker containers.
5. **Fixed Interleavings for Concurrency**: Because embedded engines like PGlite serialize statements using a single-permit semaphore (`repos/effect/packages/sql/pglite/src/PgliteClient.ts`, line 213), concurrent laws must be asserted using fixed, deterministic interleavings rather than nondeterministic timing races:
   - Two read operations issue proofs based on the same observed version.
   - The first save succeeds and commits.
   - The second save using the now-stale proof fails with a conflict.
6. **Key and Proof Isolation**: The suite must prove that proofs issued for one key or entity are refused when presented on another key.

```ts
// WRONG: a canned fake that never conflicts; every test above it passes a race the real store refuses
const fakeSettlementStore = Layer.succeed(SettlementStore, {
  readCredit: () => Effect.succeed(creditRead),
  readAllStock: Effect.succeed(stockRead),
  settle: () => Effect.succeed('Committed'),
})

// RIGHT: one history, run against both adapters
const twoSettlesOnOneVersion = Effect.gen(function*() {
  const store = yield* SettlementStore
  const first = yield* store.readCredit('customer-1')
  const second = yield* store.readCredit('customer-1')
  const stock = yield* store.readAllStock
  return [
    yield* store.settle(commandFor('order-1', first.proof, stock.proof)),
    yield* store.settle(commandFor('order-2', second.proof, stock.proof)),
  ]
})
// expected: ['Committed', 'Conflict'] for SettlementStore.memory(seed) and SettlementStore.Live over PGlite
```

Gate: `review` — verify that any port managing shared state across interactions defines formal consistency guarantees and runs against a shared law contract suite in `tests/` passing on both in-memory fakes and production database adapters, asserting base laws (read-after-write, stability, commutativity) and deterministic concurrent interleavings.
