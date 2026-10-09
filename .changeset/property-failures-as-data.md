---
"@systemfsoftware/vitest": major
---

Property failures (`PropertyRefuted`, `NonBooleanVerdict`, `CoverageBelowMinimum`, `VacuousProperty`, `SelfModelLaw`, `SeedStoreUnreadable`, `ReplayUnreadable`) are exported tagged errors whose fields (property name, site, seed, runs, witness, `replay` text) reach reporters, replacing the `detail` prose. A provided budget `seed` now gives each property its own stable seed; failing seeds are recorded in `__property_seeds__/<test file>.jsonl` and replayed first; the `vitestFork()` plugin provides `record: false` in CI and Stryker.

- To keep one literal seed, set `arbitrary: { seed }` on the property.
- Commit `__property_seeds__` files; a case that must always run belongs in the test source.
- Catch a self-model law as `SelfModelLaw`, no longer `VacuousProperty`.
