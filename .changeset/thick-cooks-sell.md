---
"@systemfsoftware/vitest": minor
---

Add @systemfsoftware/vitest, a fork of `@effect/vitest` with stricter defaults; install it under the `@effect/vitest` name. Each test builds its layers fresh and runs twice when it passes; a different second result fails as `LeakedState`. `describe` and `layer` blocks run concurrently; `layer(L, { shared: true })` shares one build. Effect bodies run on virtual time. `expect` is soft within one step and stops the test at the next; `toEqual` uses Effect `Equal`. Boolean and presence assertions, `async` bodies, per-test hooks and assertion-free tests fail with the rewrite as the message, exported from `@effect/vitest/refusals`. `it.prop(name, { of, subject, runs }, holds)` replaces the positional form and fails a file with `VacuousProperty` when no property refutes a constant stand-in; `it.law.*` adds common laws. The `utils` equality helpers no longer take a message argument.
