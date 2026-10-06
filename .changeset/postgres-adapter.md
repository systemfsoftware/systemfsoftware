---
"@systemfsoftware/effect-unit-of-work": minor
---

Add a Postgres adapter at `@systemfsoftware/effect-unit-of-work/postgres`: `postgres(makeDriver, budget)` runs a unit's whole read-decide-write in one `SqlClient` transaction at `SERIALIZABLE`, and re-runs the whole unit under the caller's budget only when the engine answers with a serialization failure or a deadlock (`40001`/`40P01`). The transaction's isolation statement means a Postgres unit needs no driver import, so the same adapter runs on PGlite and on a server.

The budget itself is decoded, not merely typed. `retryBudget(attempts, schedule)` refuses anything that is not a finite positive whole number — zero, a negative, a fraction, `NaN`, `Infinity` — with a typed `SchemaError`, and the attempts it carries are branded `Attempts`.

A budget that runs out on a re-runnable engine abort now fails with its own `SerializationBudgetExhausted { attempts, lastCause }`, naming how many runs it spent and carrying the failure that ended them; any other engine failure stays `StoreUnavailable { cause }`. Opening a unit while the caller already has a transaction open on the same client fails with `UnitInsideTransaction` and runs nothing — never a savepoint, never a silent downgrade of the `SERIALIZABLE` isolation a Postgres unit promises. The port's error channel names these failures, so a caller matches the tag without a cast.

The `laws` entry also gains `Controls.postgresReadCommitted`, the deliberately broken unit shape the race law must fail on.
