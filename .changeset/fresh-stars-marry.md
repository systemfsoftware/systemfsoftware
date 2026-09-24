---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Removes the `expect-boolean-predicate` rule. The runner's `expect` refuses a boolean actual at compile time, so a test can no longer write the form the rule caught.
