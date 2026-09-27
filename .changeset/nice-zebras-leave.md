---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

The `.contract.test.ts` suffix is retired. `test-suffix-outside-src` now reports a `*.contract.test.ts` file outside `src/`, and the behaviour-test rules (`behaviour-test-requires-gherkin`, `behaviour-one-feature-per-file`, `behaviour-exercises-use-case`, `no-pseudo-gherkin-unit-tests`) key on `*.integration.test.ts` alone. Rename a real-medium suite to `*.integration.test.ts`; a Fake-vs-Real parity suite is a `*.differential.test.ts`.
