---
"@systemfsoftware/oxlint-plugin-test-discipline": major
---

Rule `vitest-from-effect-vitest` is renamed `vitest-from-systemfsoftware-vitest`, and it now reports imports from upstream `@effect/vitest` as well as from raw `vitest`: test APIs come from `@systemfsoftware/vitest`. The Gherkin, differential, and conformance lane rules treat `@systemfsoftware/vitest` and upstream `@effect/vitest` as runner imports alongside `vitest`. Rename the rule id anywhere you configure it.
