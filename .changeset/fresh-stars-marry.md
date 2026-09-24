---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": minor
---

Removes the `vitest-from-effect-vitest` and `expect-boolean-predicate` rules. `@effect/vitest` no longer exports `expect` and refuses a boolean actual at compile time, so both concerns are enforced by types. The recommended preset no longer turns on any test-discipline rule by default.
