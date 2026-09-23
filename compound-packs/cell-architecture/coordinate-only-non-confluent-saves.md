---
title: Coordinate only non-confluent saves and rank concurrency mechanisms by writer scope
applies_when:
  - deciding concurrency control mechanisms for store mutations
  - evaluating coordination overhead, locking, or atomic regions
  - partitioning stores across aggregate and invariant boundaries
tags: [cell, store, concurrency, confluence, invariant, isolation]
---

Coordinate only when protecting non-confluent invariants. Forcing coordination on confluent operations introduces unnecessary contention and latency without improving correctness.

Operations are confluent when their execution order does not affect the validity of the invariant (Bailis et al. 2014, invariant confluence). For instance, appending audit events under fresh unique IDs commutes and requires no version check or locking. Conversely, operations claiming unique values or enforcing lower bounds while values decrease (such as credit limits or stock balance allocation) are non-confluent and require coordination.

1. **Selective Coordination**: Version checks and coordination are strictly forbidden on confluent saves (e.g. idempotent appends or monotonic writes).
2. **Mechanism Ranking**: When non-confluent invariants demand coordination, rank mechanisms from strongest to weakest by which writers they bind:
   - **Database constraint** (binds all writers across all applications and processes)
   - **Conditional write** (e.g. compare-and-set on version/etag in SQL `WHERE`)
   - **Atomic region** (e.g. `SELECT ... FOR UPDATE` row locks or SERIALIZABLE transaction blocks)
   - **In-process lock** (binds only one local OS process; useless across clustered instances)
   - **Saga** (provides atomicity via compensating actions, but zero isolation)
     **A saga does not fix read-then-write races.** Sagas offer no intermediate isolation; concurrent reads observe intermediate states.
3. **Aligned Store Boundaries**: Store boundaries must follow the scope of each invariant. When an invariant spans multiple entities, merge the stores or expose a single atomic coordination method on one store port. Never attempt to protect a multi-entity invariant by chaining separate saves with `Cell.andThen` (atomicity does not compose; Harris et al. 2005).

```ts
// WRONG: two saves chained with Cell.andThen; atomicity does not compose, so the
// credit charge can commit against a balance the stock save never re-checked
export const settleOrderCell = reserveStockCell.pipe(Cell.andThen(chargeCreditCell))

// RIGHT: Single store port encapsulates invariant scope; confluent events append freely
export interface SettlementStore {
  // Atomic single commit protects non-confluent stock decrement and credit charge
  readonly settle: (command: SettleCommand) => Effect.Effect<'Committed' | 'Conflict'>
}

export interface ReservationLog {
  // Confluent audit append: fresh id, ON CONFLICT DO NOTHING, zero version checking
  readonly appendRollback: (event: RollbackEvent) => Effect.Effect<void>
}
```

Gate: `review` — verify that confluent saves do not enforce version checks, multi-entity invariants are not split across `Cell.andThen` chains, and in-process locks or sagas are never used as isolation mechanisms for read-then-write races.
