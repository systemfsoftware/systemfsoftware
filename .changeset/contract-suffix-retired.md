---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": minor
---

The `contract` test suffix is retired. `test-suffix-outside-src` now reports a test file named with the `contract` suffix, and the behaviour-test rules (`behaviour-test-requires-gherkin`, `behaviour-one-feature-per-file`, `behaviour-exercises-use-case`, `no-pseudo-gherkin-unit-tests`) apply to the `integration` suffix alone. Rename a suite that drives a real medium to the `integration` suffix.
