---
title: Fake and real store adapters must pass one shared suite of the store's declared laws
applies_when:
  - implementing in-memory test doubles or fakes for store interfaces
  - verifying real database adapters (e.g. Postgres, SQLite, Drizzle) against store contracts
  - authoring integration tests in tests/ for store persistence
tags: [boundary, store, laws, contract-test, fakes, integration, unit-of-work]
---

A store is a port over shared state that outlives one interaction and ships a law suite that its in-memory fake and its real adapter both pass. The suite is the store's declaration: it states the laws its operations obey, which operations are atomic, and the consistency its reads see. A port with no law suite is not a store, and the store rules do not apply to it.

A test double that behaves differently from the real adapter makes every test built on it wrong (James Shore, _Testing Without Mocks_, https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks). A fake store is a stateful in-process implementation that obeys the same laws as the real one, not a mock with canned returns.

1. **One suite, both adapters.** The suite lives outside `src/` as a `*.integration.test.ts` file (e.g. `tests/settlement-store.integration.test.ts`). It runs each history against the fake (e.g. `Settlement.Memory.layer(seed)`) and the real adapter on an embedded engine (e.g. `Settlement.Drizzle.layer(spec)` over PGlite). It uses fixed histories, not generated inputs, and spawns no processes.
2. **Base laws, for every store:**
   - read-after-write: a read after a successful save returns the value written;
   - a repeated read changes nothing and returns the same value;
   - operations on different keys commute: their order does not change the final state.

   A store with blind writes adds last-write-wins.
3. **Unit-of-work laws, for a store with a unit of work:**
   - a unit of work that fails writes nothing, on both adapters;
   - on the fake, concurrent units of work for one key leave the state some serial order would leave;
   - on the real adapter, a serialization failure raised by the engine (SQLSTATE `40001`) re-runs the whole unit, and the unit commits once;
   - a unit kept after its unit of work ended dies on every read and save before touching the store, on both adapters.

   Never fake the engine's error in an adapter or fixture. Raise it from the engine, for example with a test-only trigger that raises `40001` while an arming row says so.
4. **PGlite cannot race.** `@effect/sql-pglite` has one connection and holds a single-permit semaphore from `BEGIN` to commit (`repos/effect/packages/sql/pglite/src/PgliteClient.ts`, lines 212–224), so units on PGlite run one at a time. The suite proves atomicity and the retry path, never isolation. Real concurrency is proven by a race against a Postgres server, run by hand or by a dedicated job.

```ts
// WRONG: a fake whose unitOfWork does not serialize. Two concurrent orders for one
// customer with room for one are both granted, and every test above it passes a race
// the real store refuses.
const leakyUnitOfWork = <A, E, R>(use: (unit: SettlementUnit) => Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.flatMap(SettlementUnit.open(driverOver(state)), use))

// RIGHT: one history, run against both adapters. The fake runs units one at a time
// on a staged copy of its state, so a failed unit writes nothing.
const twoOrdersWithRoomForOne = Effect.gen(function*() {
  const store = yield* SettlementStore
  yield* Effect.all([placeOrder(store, 'order-1'), placeOrder(store, 'order-2')], { concurrency: 2 })
  return yield* store.unitOfWork(SettlementUnit.load(customerKey))
})
// expected: exactly one charge, for Settlement.Memory.layer(seed) and Settlement.Drizzle.layer(spec) over PGlite
```

Gate: `review` — verify that every store ships one `*.integration.test.ts` law suite that its fake and its real adapter both pass, covering the base laws and, for a store with a unit of work, the four unit-of-work laws, with serialization failures raised by the engine and real concurrency left to a race against a Postgres server.
