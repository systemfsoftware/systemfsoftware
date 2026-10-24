---
"@systemfsoftware/effect-schema-law": minor
---

Laws now register as plain Vitest tests: `@systemfsoftware/vitest` is no longer a peer dependency, and `vitest` is an optional peer. `ruleOfSchemas` and `recursionLaws` keep their signatures and test names, except that the single-inhabitant law's name no longer carries the `[exempt: deterministic]` suffix. Inputs are drawn from each schema's Effect `Arbitrary` and runs are driven by fast-check, now a runtime dependency; a failure reports fast-check's shrunk counterexample and replay seed. A draw the schema's `Arbitrary` cannot produce, or an Effect verdict that fails, is reported as its own failure rather than a refutation. A suite configured by `@systemfsoftware/vitest-config` still runs the laws under the fork's guard and at its provided run budget.
