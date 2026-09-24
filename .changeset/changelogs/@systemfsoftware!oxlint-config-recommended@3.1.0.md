## 3.1.0

### Minor Changes

- Removes the `expect-boolean-predicate` rule, and the recommended preset no longer turns it on. The runner's `expect` refuses a boolean actual at compile time, so a test can no longer write the form the rule caught.
