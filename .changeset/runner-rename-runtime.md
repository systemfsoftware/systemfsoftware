---
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/vitest": minor
---

`@systemfsoftware/differential-spec` depends on and imports `@systemfsoftware/vitest` by its own name instead of through an `@effect/vitest` alias. `@systemfsoftware/vitest` documentation examples import from `@systemfsoftware/vitest`.

The lawful runner is published under its own name, `@systemfsoftware/vitest`, starting at `0.1.0`, so peers declared as `^0.1.0` accept its patch releases.
