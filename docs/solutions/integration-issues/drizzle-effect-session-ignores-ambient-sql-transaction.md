---
title: Drizzle's Effect session ignores the ambient SqlClient transaction and defaults to READ COMMITTED
date: "2026-09-24"
category: integration-issues
module: systemfsoftware
problem_type: integration_issue
component: example-inventory-fulfillment
symptoms:
  - "A drizzle write inside `SqlClient.withTransaction` survives when that transaction rolls back"
  - "`SELECT txid_current()` through drizzle returns a different transaction id than the ambient `SqlClient` inside the same `withTransaction`"
  - "A `db.transaction(...)` without an isolation option runs at READ COMMITTED, and concurrent load-decide-write orders over-grant credit"
  - "Retry predicates that read only `error.code` or walk only `.cause` never see SQLSTATE 40001"
root_cause: wrong_api
resolution_type: design_change
severity: high
related_components:
  - SettlementStoreDrizzle
  - DrizzleSession
tags:
  - drizzle
  - effect-sql
  - transactions
  - serializable
  - unit-of-work
  - sqlstate
---

# Drizzle's Effect session ignores the ambient SqlClient transaction and defaults to READ COMMITTED

## Problem

The obvious way to make a read-decide-write atomic in Effect is to wrap it at the edge in `SqlClient.withTransaction`. With drizzle's Effect Postgres session (drizzle-orm 1.0.0-rc.5 over effect sql-pg 4.0.0-rc.117), that wrapper does nothing for drizzle queries. They run outside it, so the "transaction" commits nothing atomically, and a rollback leaves drizzle's writes in place.

## Symptoms

- A probe against Postgres 17 ran `SELECT txid_current()` through `SqlClient` and through drizzle inside one `client.withTransaction(...)`. The two ids differed.
- The same probe inserted a row through drizzle inside `client.withTransaction(...)` and then failed the transaction. The row survived.
- Opening the unit with `db.transaction(fn)` and no options ran at READ COMMITTED. Racing 20-unit orders against a credit limit of 100 then charged 200.

## What Didn't Work

- **An edge-level `sql.withTransaction` around the cell.** Drizzle queries do not join it (the probe above).
- **Relying on the driver's default isolation.** Drizzle's Effect session emits `set transaction isolation level ...` only when the caller passes `isolationLevel` (its `getTransactionConfigChunks`); otherwise Postgres uses READ COMMITTED.
- **A retry predicate on `error.code`.** Drizzle wraps the driver error in `EffectDrizzleQueryError`, whose failure sits inside an Effect `Cause` (`reasons`). Neither the top-level error nor a plain `.cause` walk reaches the SQLSTATE. With that predicate, every serialization failure looked like an outage, and the retry never ran.

## Solution

The store port owns the unit of work, and its drizzle adapter opens the transaction itself with the isolation level stated on every call. `examples/inventory-fulfillment/src/store/SettlementStoreDrizzle.ts`:

```ts
unitOfWork: <A, E, R>(use: (unit: SettlementUnit.SettlementUnit) => Effect.Effect<A, E, R>) =>
  db.transaction(
    (tx) =>
      Effect.scoped(Effect.flatMap(
        SettlementUnit.open({ load: (key) => load(tx, key), settle: (plan) => settle(tx, plan) }),
        use,
      )),
    { isolationLevel: 'serializable' },
  ).pipe(
    Effect.retry({ while: (error) => retryable(error), times: Math.max(0, budget.attempts - 1), schedule: backoff }),
    Effect.catchTag('SqlError', (cause) => Effect.fail(new StoreUnavailable({ cause }))),
  ),
```

The unit handle's slot holds `load` and `settle` bound to drizzle's `tx`, so they can only run on the transaction `unitOfWork` opened, and the unit closes when that transaction's scope ends. `sqlStatesOf` in the same file collects SQLSTATEs through `.cause` fields and through Effect `Cause` fail and die reasons, and `retryable` matches only `40001` and `40P01`.

## Why This Works

Drizzle's Effect session opens its own connection-level transaction and knows nothing about `SqlClient`'s transaction service. The only transaction a drizzle query joins is the `tx` handle drizzle itself passes in. Putting the unit of work on the store port makes that handle the only path to the tables, and binding `load` and `settle` to it inside a unit handle makes a read or save with no unit a type error. Passing `isolationLevel` on the same call is what makes Postgres check the unit against every other serializable writer.

## Prevention

- Never compose drizzle queries under `SqlClient.withTransaction` expecting atomicity. The atomic unit is `db.transaction`, owned by the store adapter.
- State `isolationLevel` on every `db.transaction`. The race in `examples/inventory-fulfillment/scripts/race.ts` against a real Postgres is what catches a dropped isolation level, because PGlite has one connection and never races (issue #508 proposes running it in CI).
- A retry predicate on drizzle errors must search Effect `Cause` reasons, not only `.cause`. Prove it with an engine-raised `40001` (the settlement suite's serialization-seam trigger), never a hand-built error.

## Related Issues

- PR #495: the store rebuild on a serializable unit of work.
- `compound-packs/cell-architecture/store-serializable-unit-of-work.md` and `store-unit-of-work-handle.md`: the doctrine this adapter implements.
