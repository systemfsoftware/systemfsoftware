---
"@systemfsoftware/vitest": minor
---

Add @systemfsoftware/vitest, a fork of `@effect/vitest` with its test API and stricter defaults; install it under the `@effect/vitest` name. Each test builds its layers fresh and runs twice when it passes; a different second result fails as `LeakedState`. `layer` blocks run concurrently and shuffled unless given `{ shared: true }`. Effect bodies run on self-advancing virtual time. `expect` is soft within one step and stops the test at the next; `toEqual` uses Effect `Equal`. Boolean and presence assertions, `async` bodies, per-test hooks, unprovided services and assertion-free tests fail with the rewrite as the message. `it.prop(name, { of, subject, runs }, holds)` replaces the positional form and fails a file with `VacuousProperty` when no property refutes a constant stand-in for the subject; `it.law.*` adds common laws. The `utils` equality helpers no longer take a message argument.
