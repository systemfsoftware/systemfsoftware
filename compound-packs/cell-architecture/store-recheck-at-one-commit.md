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

1. **Single Commit Point**: All state modifications protecting an invariant must commit in one atomic operation.
2. **Atomic Re-check Mechanisms**: The operation must be built in one of two ways:
   - **Conditional write**: Guarded by a version, etag, or predicate condition (e.g. `WHERE credit_version = $observed` under PostgreSQL 17 transaction isolation, re-evaluating `WHERE` against concurrently committed rows; https://www.postgresql.org/docs/17/transaction-iso.html).
   - **Store-run decision in an atomic region**: The store executes the pure decision inside its own atomic boundary, explicitly naming what makes it atomic: row locks (`SELECT ... FOR UPDATE`) or SERIALIZABLE isolation with automated retry.
3. **Total Invariant Coverage**: The re-check covers every value `decide` read that the invariant depends on, including records from secondary entities (e.g. both customer credit version and allocated stock lot versions). Values that only determine non-invariant choices (such as which equivalent stock lot an allocation draws from) may go unchecked if explicitly recorded by the store.
4. **Conflict and Retry Protocol**: When the re-check fails, the save returns a typed conflict outcome (`'Conflict'`). The caller retries by rerunning the entire cell from `read`. Retry count and spacing must be governed by external configuration (e.g. jittered schedule), never hardcoded literals in cell logic. Irreversible external side effects must occur only at or after the commit point, unless idempotent.

```ts
// WRONG: two writes; the stock save re-checks lot versions, the charge re-checks nothing
const settle = (decision: CoreFulfillmentDecision, read: SettlementRead) =>
  Effect.flatMap(ReservationLog, (log) => log.commit(reservationCommitOf(decision, read))).pipe(
    Effect.andThen(Effect.flatMap(CreditLedger, (ledger) => ledger.charge(read.customerId, amountOf(decision)))),
  )

// RIGHT: one store call commits credit, stock, reservations and audit, or conflicts
const settle = (decision: CoreFulfillmentDecision, read: SettlementRead) =>
  Effect.flatMap(SettlementStore, (store) => store.settle(settlementCommandOf(decision, read))).pipe(
    Effect.flatMap((outcome) =>
      Match.value(outcome).pipe(
        Match.when('Conflict', () => Effect.fail(new OptimisticConflict({}))),
        Match.when('Committed', () => Effect.void),
        Match.exhaustive,
      )
    ),
  )
// The RPC edge retries OptimisticConflict by running the whole cell again:
// Effect.retry({ times: config.maxRetries - 1, schedule: Schedule.spaced(config.retryInterval).pipe(Schedule.jittered), ... })
```

Gate: `review` — verify that multi-entity invariants commit in a single atomic transaction re-checking all observed dependency versions, return typed conflict tokens on mismatch, and execute irreversible effects only at or after commit.
