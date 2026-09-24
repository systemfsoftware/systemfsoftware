---
"@systemfsoftware/oxlint-config-recommended": minor
---

The default config now refuses `expect(<predicate>)` asserted against `true` or `false`, and `expect` imported from `vitest` instead of `@effect/vitest`, as errors in every file it lints.
