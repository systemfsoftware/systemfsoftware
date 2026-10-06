---
"@systemfsoftware/effect-unit-of-work": minor
---

Add a Durable Object adapter at `@systemfsoftware/effect-unit-of-work/durable-object`: `durableObject(storage, makeDriver)` runs a unit's read, decide and write inside one `transactionSync`, so concurrent requests cannot interleave between them and a unit that fails writes nothing. A unit that reaches an async step fails with the `UnitWentAsync` defect and leaves no row behind, and a unit whose work has ended refuses every further read and write with `UnitEnded`. The `laws` entry also gains `Controls.doRunPromise`, the deliberately broken Durable Object shape the race law must fail on.
