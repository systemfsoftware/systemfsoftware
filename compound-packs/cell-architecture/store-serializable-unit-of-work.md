---
title: Run a read-decide-save that protects a non-confluent invariant inside one serializable unit of work
applies_when:
  - saving state computed from an earlier read
  - protecting business invariants against concurrent modification (lost updates, write skew)
  - choosing a concurrency mechanism for a store or a use case
  - composing several decisions that must commit together
tags: [cell, store, concurrency, serializable, unit-of-work, write-skew, retry]
---

When a save depends on an earlier read and protects a non-confluent invariant, the read, the decision, and the save run inside one unit of work that the store owns. The default unit of work is a SERIALIZABLE transaction, re-run whole when the database reports a serialization failure.

Splitting the read from the save, or splitting one invariant's saves across several transactions, permits lost updates (Berenson et al. 1995, P4) and write skew (Berenson et al. 1995, A5B). The inventory-fulfillment example charged 120 against a credit limit of 100 in every run: orders for different products touched different stock lots, and the credit charge committed separately from the reservation. Atomicity does not compose across separate transactions (Harris et al. 2005).

1. **One sandwich per use case.** The use case is one `Sandwich` over one composed workflow, and the whole cell runs through `store.unitOfWork`. The workflow's steps are module-scope pure functions in the workflow's own file, not imported workflows: a `Workflow.make` body may reference no other local module (`make-body-purity`), and a file holds one `Workflow.make`. Never enforce an invariant by chaining saves with `Cell.andThen`. Store boundaries follow the scope of each invariant: when an invariant spans two stores, merge them or run both inside one unit of work on one port.
2. **Every read the decision depends on runs inside the unit.** That includes existence checks such as "has this order id been reserved". A read taken before the unit opens is outside serialization and can go stale.
3. **SERIALIZABLE for every writer.** Postgres checks a serializable transaction only against other serializable transactions (Postgres 17 §13.2.3, https://www.postgresql.org/docs/17/transaction-iso.html; §13.4.1, https://www.postgresql.org/docs/17/applevel-consistency.html). Every writer of the tables an invariant spans runs at SERIALIZABLE. Pass the isolation level explicitly on every transaction; drivers default to READ COMMITTED. Do not add `SELECT ... FOR UPDATE` inside a serializable unit to reduce contention: §13.2.3 advises removing such locks, and in the race below it caused more re-runs and up to 3x the wall time.
4. **Retry the whole unit, and only on serialization failures.** On SQLSTATE `40001` (serialization_failure) or `40P01` (deadlock_detected), re-run the unit from its first read, including the decision (Postgres 17 §13.5, https://www.postgresql.org/docs/17/mvcc-serialization-failure-handling.html). Do not retry other errors: a unique or check violation can be persistent. The retry budget and backoff come from configuration at the composition root, never from literals in cell or adapter code. A spent budget fails with the store's unavailable error, carrying the last serialization failure as its cause, and has written nothing. Irreversible effects run after commit unless they are idempotent.
5. **Coordinate only non-confluent invariants.** A save is confluent when the order of concurrent saves cannot break the invariant (Bailis et al. 2014): appending audit events under fresh ids needs no unit of work. Claiming a unique value, or keeping a lower bound while values decrease, needs coordination.
6. **Rank mechanisms by which writers they bind**, strongest first:
   - a database constraint (binds every writer);
   - a single-statement conditional write, when the invariant lives on one row;
   - a SERIALIZABLE unit of work with whole-unit retry (binds every serializable writer);
   - row locks under READ COMMITTED (correct only if every row the decision reads is locked, and nothing checks that);
   - an in-process lock (one process only);
   - a saga (compensation without isolation; a saga does not fix read-then-write races).

   Back a unit of work with a constraint where one exists, such as `CHECK (quantity_on_hand >= 0)`.

Measured against Postgres 17 (credit limit 100, 20-unit orders on two SKUs, one pool per app instance):

| Carrier                                      | 2 instances / 10 orders | 4 / 20    | 8 / 40  | Result                                        |
| -------------------------------------------- | ----------------------- | --------- | ------- | --------------------------------------------- |
| One sandwich, SERIALIZABLE, whole-unit retry | 47 tx                   | 112 tx    | 235 tx  | All invariants hold; exactly 5 orders granted |
| Same code at READ COMMITTED                  | 10 tx                   | 20 tx     | 40 tx   | 200 charged against a limit of 100            |
| SERIALIZABLE plus `SELECT ... FOR UPDATE`    | 51 tx                   | 120 tx    | 281 tx  | Holds; more re-runs, up to 3x slower          |
| Row locks under READ COMMITTED               | 0 re-runs               | 0 re-runs | not run | Holds only because every row read was locked  |

Version columns and optimistic checks belong to business transactions that span several system transactions (Fowler, Optimistic Offline Lock, https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html). When the read and the save run in one request, one serializable transaction covers both and checks every value the decision read, not only the columns someone chose to guard.

```ts
// WRONG: four sandwiches chained; each commits alone, so the credit charge
// commits without checking the stock read that justified it.
export const fulfillmentCell = explodeBundleCell.pipe(
  Cell.andThen(checkCreditCell),
  Cell.andThen(allocateStockCell),
  Cell.andThen(settleFulfillmentCell),
)

// RIGHT: one sandwich over one composed workflow, built over the unit the store hands out.
export const placeOrderCell = (unit: SettlementUnit) => {
  const read = loadIn(unit)
  return Sandwich.named('inventory.fulfillment.place')(read)
    .decide(placeOrder)
    .write({ OrderAllocated: commitIn(unit), OrderHeld: commitIn(unit), InsufficientStock: refuse /* ... */ })
}

const submitOrder = (request: FulfillmentRequest) =>
  Effect.gen(function*() {
    const store = yield* SettlementStore
    return yield* store.unitOfWork((unit) => placeOrderCell(unit).run(request))
  })
```

Gate: `review` — verify that each use case protecting a non-confluent invariant is one sandwich run through the store's SERIALIZABLE `unitOfWork`, that every read its decision depends on happens inside the unit, that only 40001 and 40P01 re-run the whole unit under a configured budget, that no `SELECT ... FOR UPDATE`, in-process lock, saga, or `Cell.andThen` chain stands in for it, that confluent saves are not coordinated, and that irreversible effects run only after commit.
