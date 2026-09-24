---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Add `expect-boolean-predicate`, which refuses an `expect` on a predicate call, comparison, negation or `&&`/`||` asserted with `toBe(true|false)` and names the `toSatisfy` or `toEqual` rewrite, and `expect-from-effect-vitest`, which refuses importing `expect` from `vitest`. `prop-arbitrary-schema-origin` also checks the `of` entries of the object form `it.prop(name, { of, subject, runs }, holds)`.
