---
"@systemfsoftware/effect-schema-law": minor
"@systemfsoftware/oxlint-plugin-cell-vocabulary": none
"@systemfsoftware/oxlint-plugin-property-testing": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
"@systemfsoftware/stryker-js": none
"@systemfsoftware/stryker-js-cli": none
"@systemfsoftware/stryker-js-engine": none
"@systemfsoftware/stryker-js-html-reporter": none
---

`recursionLaws` registers a recursive schema's generation laws — nesting inside the declared ceiling, a deep-value floor, and every member of the cycle reachable — beside its codec laws, and registers nothing for a schema with no recursion cycle. Pass the recursion point itself: the `Schema.suspend` that returns the union now works, not only the union.

A declared ceiling that nothing materialized fails the suite with a named error, instead of quietly generating stock values; the deep-value law registers only when the declaration asks for more depth than the stock derivation reaches.
