---
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/oxlint-config-recommended": patch
"@systemfsoftware/vitest": patch
---

`@systemfsoftware/differential-spec` depends on and imports `@systemfsoftware/vitest` by its own name instead of through an `@effect/vitest` alias. `@systemfsoftware/oxlint-config-recommended` enables the test-discipline rule under its new id `vitest-from-systemfsoftware-vitest`. `@systemfsoftware/vitest` documentation examples import from `@systemfsoftware/vitest`.
