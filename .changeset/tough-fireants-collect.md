---
"@systemfsoftware/oxlint-plugin-test-discipline": major
---

Each rule now picks the tests it applies to by what they import and call, never by file name or folder; `vitest-from-systemfsoftware-vitest` alone reports runner imports, and the Vitest runner packages are no longer exempt by name.

1. Rename each test so its lane word matches the spec package it imports: `conformance`, `differential`, `trace`, or `integration` for `@systemfsoftware/effect-gherkin-spec` alone.
2. Give every test that imports `@systemfsoftware/effect-gherkin-spec` one `Feature` with `.withLayer(...)` and an import of the package under test.
3. A package that is itself a Vitest runner sets `settings: { '@systemfsoftware/oxlint-plugin-test-discipline': { role: 'vitest-runner' } }` in its lint config, and uses the `runner` lane word for tests that import only a runner.
