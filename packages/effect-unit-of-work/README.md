# @systemfsoftware/effect-unit-of-work

One atomic read-decide-write unit for stores. A store's reads and writes run on a `Unit<D>` handle, and an adapter decides what makes the unit atomic: an in-memory staged copy, a Durable Object `transactionSync`, or a Postgres SERIALIZABLE transaction. A law kit checks any adapter and returns `Held | Broken` verdicts as values.

## Installation

The package is not on npm. It is a Nix flake output of `github:systemfsoftware/systemfsoftware`, pinned by your `flake.lock`: a release tag for a stable version, a pull request's head rev for a snapshot. Your flake builds the package tarball, and `package.json` depends on it with a `file:` path.

## Entry points

| Specifier                                             | Holds                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@systemfsoftware/effect-unit-of-work`                | the `UnitOfWork` namespace: `Unit<D>`, the `UnitOfWork<D, F>` port, `use`, `StoreUnavailable`, `UnitEnded`, `memory` |
| `@systemfsoftware/effect-unit-of-work/durable-object` | `durableObject`, `UnitWentAsync`, the Durable Object storage types                                                   |
| `@systemfsoftware/effect-unit-of-work/postgres`       | `postgres`, `retryBudget`, `RetryBudget`, `SerializationBudgetExhausted`, `UnitInsideTransaction`                    |
| `@systemfsoftware/effect-unit-of-work/laws`           | the store laws, the race law, `Held` / `Broken`, and `Controls` (shapes that must fail)                              |

The subpaths refer to the unit types through the root namespace, so each name has one import path.

## A unit

`D` is your driver: the read and write operations of one transaction. Each adapter takes a `makeDriver` function and returns a `UnitOfWork<D>`, a function that runs `use` on a fresh unit. Reach the driver with `UnitOfWork.use`.

```ts
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Effect, Ref } from 'effect'

interface Seats {
  readonly taken: Effect.Effect<number>
  readonly take: (request: string) => Effect.Effect<void>
}

const noSeats: ReadonlyArray<string> = []

const program = Effect.gen(function*() {
  const unitOfWork = yield* UnitOfWork.memory(
    noSeats,
    (state): Seats => ({
      taken: Effect.map(Ref.get(state), (seats) => seats.length),
      take: (request) => Ref.update(state, (seats) => [...seats, request]),
    }),
  )
  return yield* unitOfWork((unit) =>
    Effect.gen(function*() {
      const taken = yield* UnitOfWork.use(unit, (seats) => seats.taken)
      if (taken >= 100) return 'refused'
      yield* UnitOfWork.use(unit, (seats) => seats.take('alice'))
      return 'granted'
    })
  )
})
```

The unit is open only while `use` runs. Calling `UnitOfWork.use` on it afterwards dies with `UnitEnded` before it reaches the driver.

## Adapters

All adapters return the same `UnitOfWork<D, F>` port, so a store chooses its storage by which one it calls. `F` is the adapter's own failure: `StoreUnavailable` for memory and the Durable Object, `PostgresUnitFailure` for Postgres.

### What a rollback undoes

A rollback undoes only what the unit wrote through its driver. Anything else the unit did (a log line, a counter, an HTTP call, a message sent) has already happened and stays done. Make such effects safe to repeat with an idempotency key the store records in the same unit, or move them after the unit commits.

### Memory

`UnitOfWork.memory(initial, makeDriver)` runs one unit at a time over a staged copy of the state and keeps the copy only when the unit succeeds. Use it in tests and examples.

### Durable Object

`durableObject(storage, makeDriver)` runs the unit inside `storage.transactionSync` on the object's SQLite storage. `makeDriver` receives the `SqlStorage`.

**Nothing inside the unit may be asynchronous.** The unit runs synchronously so the object's input gate holds for its whole read-decide-write. If the unit suspends (a sleep, a promise, a fetch), the transaction rolls back, the leftover fiber is interrupted, and the unit dies with `UnitWentAsync`. A failed unit also rolls back.

### Postgres

`postgres(makeDriver, budget)` runs on `effect/sql`'s `SqlClient`, so the `SqlClient` layer you provide picks the driver, for example `@effect/sql-pg` or `@effect/sql-pglite`. It returns an `Effect` that needs `SqlClient`.

- Each unit runs in `SqlClient.withTransaction`, and its first statement is `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`.
- A unit started while the same `SqlClient` already has a transaction open fails with `UnitInsideTransaction` and runs nothing. It never becomes a savepoint inside your transaction, and SERIALIZABLE is never silently lowered.
- When Postgres reports a serialization failure (`40001`) or a deadlock (`40P01`), the whole unit re-runs from its first read. No other error re-runs; another `SqlError` fails with `StoreUnavailable` carrying it.
- Build the budget with `retryBudget(attempts, schedule)`: the most runs and the backoff between them. `attempts` must be a finite positive integer; `0`, a negative, a fraction, `NaN` or `Infinity` fails with a `SchemaError`.
- When every run ended in `40001` or `40P01`, the unit fails with `SerializationBudgetExhausted { attempts, lastCause }`: the runs spent and the last `SqlError`. That is a contended aggregate, not an outage, so catch it apart from `StoreUnavailable`.

Drizzle sessions do not join a `SqlClient` transaction. Run a unit's statements through the `SqlClient` the driver receives, not through a Drizzle session.

## Laws

`./laws` checks a store against the unit contract. Each law is an Effect that returns a verdict: `Held`, or `Broken` with the law's name and a witness.

| Law                                | Holds when                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `readAfterWrite`                   | a unit reads what it wrote                                                     |
| `idempotentRead`                   | two reads in one unit agree                                                    |
| `crossKeyCommute`                  | writes to different keys commute                                               |
| `failedUnitWritesNothing`          | a unit that fails leaves no write behind                                       |
| `concurrentUnitsSerialize`         | two concurrent units end in one of the two serial orders                       |
| `endedUnitDies`                    | a unit used after it ended dies with `UnitEnded`                               |
| `engineRerunsSerializationFailure` | an engine-raised `40001` re-runs the unit and commits once (Postgres)          |
| `race`                             | concurrent claims against a cap grant exactly the cap and store that many rows |

A law takes a `StoreSubject<D>` (the `unitOfWork` port plus `read` and `write` on a unit); `race` takes a `RaceSubject<D>`, which adds `cap`, `claim` and `count`; `engineRerunsSerializationFailure` takes an `EngineRetrySubject<D>`, which can arm a `40001`. Your tests assert the verdict.

`Controls` holds two deliberately broken shapes that must fail `race`: `Controls.doRunPromise`, a Durable Object unit run with `Effect.runPromise` outside a transaction, and `Controls.postgresReadCommitted`, the Postgres adapter at READ COMMITTED. Run them next to your adapter to show the race law can fail.

## How this package tests itself

One law suite runs every law against every adapter: memory, a Durable Object in real workerd, Postgres on PGlite, and Postgres on a real server. Each adapter is a subject Layer. A subject is excused from a law only by name, with a reason: memory and the Durable Object have no engine that raises `40001`, and PGlite has one connection and cannot race. Deliberately broken subjects reach every `Broken` branch, so a law that stopped catching its defect fails the suite.

The Postgres server is a throwaway PostgreSQL 17 built from the repository flake (`nix build .#postgresql_17`), started on a random local port and deleted when the suite ends. Its race sends 24 claims at a 20-seat cap: the SERIALIZABLE adapter grants exactly 20, and the READ COMMITTED control grants more than 20. Without Nix the suite fails with `PostgresUnavailable`; it does not skip.
