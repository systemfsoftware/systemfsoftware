---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": minor
---

Removes the `expect-boolean-predicate` rule, and the recommended preset no longer turns it on. The runner's `expect` refuses a boolean actual at compile time, so a test can no longer write the form the rule caught.
