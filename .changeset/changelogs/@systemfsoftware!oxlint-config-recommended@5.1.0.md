# @systemfsoftware/oxlint-config-recommended@5.1.0

Adds the `e2e-tier-placement` rule, enabled at `error` in the recommended preset. It reports an end-to-end test (a file value-importing `test`, or its namespace, from `@systemfsoftware/effect-e2e/runner`) in a package that does not declare the `e2e` role. In a package that declares it, it reports an integration test (a file importing `@systemfsoftware/effect-gherkin-spec` that is not an end-to-end test).

Declare the role under the plugin key in the package's lint `settings`: `settings: { '@systemfsoftware/oxlint-plugin-test-discipline': { role: 'e2e' } }`.

End-to-end test files are now test files: `tests-dir-helpers-in-fixtures` no longer reports them as helpers, and `test-suffix-outside-src` requires the `e2e` file suffix.

A package that holds `@systemfsoftware/effect-e2e` suites declares `role: 'e2e'` in its lint settings. An end-to-end test outside such a package moves into one. No change a consumer can observe. turbo moved 2.11.8 -> 2.11.10
