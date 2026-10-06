---
"@systemfsoftware/effect-unit-of-work": minor
---

Add a Postgres adapter at `@systemfsoftware/effect-unit-of-work/postgres`: `postgres(makeDriver, budget)` runs a unit's whole read-decide-write in one `SqlClient` transaction at `SERIALIZABLE`, and re-runs the whole unit under the caller's budget only when the engine answers with a serialization failure or a deadlock (`40001`/`40P01`); a spent budget fails with `StoreUnavailable` carrying the last cause. The transaction's isolation statement means a Postgres unit needs no driver import, so the same adapter runs on PGlite and on a server. The `laws` entry also gains `Controls.postgresReadCommitted`, the deliberately broken unit shape the race law must fail on.
