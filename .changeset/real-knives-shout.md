---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Add `expect-boolean-predicate`, which refuses an `expect` on a predicate call, comparison, negation or `&&`/`||` asserted with `toBe(true|false)` and names the `toSatisfy` or `toEqual` rewrite, and `vitest-from-effect-vitest`, which refuses any value import from `vitest` — named, namespace, default, side-effect or dynamic — and names `@effect/vitest` as the rewrite; a type-only import stays legal. `prop-arbitrary-schema-origin` also checks the `of` entries of the object form `it.prop(name, { of, subject, runs }, holds)`.
