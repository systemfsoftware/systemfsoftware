---
"@systemfsoftware/vitest": minor
---

Add `@systemfsoftware/vitest/plugin`. List `vitestFork()` in a package's Vite `plugins` to provide the fork's runtime context per test project: the package's npm name, the workspace root failure paths print relative to, and the property budget (30 runs in a Stryker worker, 1000 in CI with `AGENT` unset, 100 otherwise; CI and Stryker runs never write the seed store). A key the project's own `test.provide` sets is left alone. The plugin also resolves `effect/TestClock` to `@systemfsoftware/vitest/TestClock`, so the compat type the package ships now resolves at runtime outside this repository too. It sets no test option.
