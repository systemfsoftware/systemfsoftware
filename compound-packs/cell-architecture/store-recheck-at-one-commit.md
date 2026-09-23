---
title: Re-check all observed values protecting non-confluent invariants at a single atomic commit point
applies_when:
  - saving state computed from an earlier read phase
  - protecting business invariants against concurrent modification (lost updates, write skew)
  - implementing write handlers or store mutation operations
tags: [cell, store, concurrency, atomic-commit, write-skew, optimistic-locking]
---

When a save depends on an earlier read and protects a non-confluent invariant, it must commit through one atomic operation that re-checks every value the invariant depends on.

Splitting validation and persistence across multiple uncoordinated writes permits write skew (Berenson et al. 1995, A5B) and lost updates (Berenson et al. 1995, P4). For example, before this fix, the inventory fulfillment example charged 120 against a limit of 100 because orders for different products touched different stock lots and the credit charge ran unguarded after the reservation transaction.

1. **Single Commit Point**: All state modifications protecting a non-confluent invariant must commit in one atomic operation. Store boundaries follow invariant scope: when an invariant spans multiple entities, merge the stores or expose a single atomic method. Never chain separate saves with `Cell.andThen` (atomicity does not compose; Harris et al. 2005).
2. **Selective Coordination**: Coordinate only when protecting non-confluent invariants. Operations are confluent when execution order does not affect invariant validity (Bailis et al. 2014). Appending audit events under fresh IDs commutes and requires no version check or lock. Claiming unique values or keeping lower bounds as balances decrease is non-confluent and requires coordination. Version checks on confluent saves are forbidden.
3. **Mechanism Ranking**: Rank coordination mechanisms by which writers they bind, strongest to weakest:
   - **Database constraint** (binds all writers across all applications and processes)
   - **Conditional write** (e.g. `WHERE version = $observed` under PostgreSQL 17 transaction isolation, re-evaluating `WHERE` against concurrently committed rows; https://www.postgresql.org/docs/17/transaction-iso.html)
   - **Atomic region** (e.g. `SELECT ... FOR UPDATE` row locks or SERIALIZABLE transaction blocks with retry)
   - **In-process lock** (binds only one local OS process; useless across clustered instances)
   - **Saga** (provides compensating atomicity, but zero isolation; sagas do not fix read-then-write races)
4. **Total Invariant Coverage**: The re-check covers every value `decide` read that the invariant depends on, including records from secondary entities (e.g. both customer credit version and allocated stock lot versions). Values that only determine non-invariant choices (such as which equivalent stock lot an allocation draws from) may go unchecked if explicitly recorded by the store.
5. **Conflict and Retry Protocol**: When the re-check fails, the save returns a typed conflict outcome (`'Conflict'`). The caller retries by rerunning the entire cell from `read`. Retry count and spacing must be governed by external configuration (e.g. jittered schedule), never hardcoded literals in cell logic. Irreversible external side effects must occur only at or after the commit point, unless idempotent.

```ts
// WRONG: two saves chained with Cell.andThen; atomicity does not compose.
// The stock save re-checks lot versions, but the credit charge re-checks nothing.
export const settleOrderCell = reserveStockCell.pipe(Cell.andThen(chargeCreditCell))

// RIGHT: one store call commits credit, stock, reservations, and audit in a single transaction,
// or conflicts. Confluent audit/rollback events append freely under fresh ids with no version check.
export interface SettlementStore {
  readonly settle: (command: SettlementCommand) => Effect.Effect<'Committed' | 'Conflict'>
}

export interface ReservationLog {
  readonly appendRollback: (event: RollbackEvent) => Effect.Effect<void>
}

// The RPC edge retries OptimisticConflict by running the whole cell again:
// Effect.retry({ times: config.maxRetries - 1, schedule: Schedule.spaced(config.retryInterval).pipe(Schedule.jittered), ... })
```

Gate: `review` — verify that multi-entity invariants commit in a single atomic transaction re-checking all observed dependency versions, confluent saves do not enforce version checks, store boundaries are not split across `Cell.andThen`, in-process locks or sagas are never used for read-then-write isolation, and irreversible effects execute only at or after commit.

Gate: `review` — verify that multi-entity invariants commit in a single atomic transaction re-checking all observed dependency versions, return typed conflict tokens on mismatch, and execute irreversible effects only at or after commit.
