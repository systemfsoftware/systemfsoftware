---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Add four rules:

- `no-product-fakes`: refuse a test that fakes the product with a mock, a DOM emulator or a mock server. The `fakeApis`, `bannedModules` and `bannedEnvironments` options name the doubles, modules and `test.environment` values to refuse.
- `no-sleeps`: refuse a test that waits for a fixed time instead of a condition. The `testFilePattern` option names which paths count as tests.
- `role-label-text-queries`: refuse a page query by CSS, a test id or a data attribute, so tests query by role, label or visible text.
- `a11y-gate-on`: refuse a story whose `parameters.a11y.test` is not `'error'` or that sets `disable: true`.
