---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": patch
---

New rule `trace-test-requires-taxonomy` at error: a test file named with the `trace.test` suffix is a trace spec, and a trace spec cannot quietly assert HTTP status. The rule requires at least one import binding from `@systemfsoftware/trace-spec`, forbids terminating a case on an HTTP status or response-body assertion such as `expect(res.status).toBe(200)`, and forbids raw emit calls (`startSpan`, `spanBuilder`, `startActiveSpan`) inside a trace spec. `test-suffix-outside-src` now admits the `trace.test` suffix, so a correctly named trace spec is not rejected by the placement rule. The recommended preset enables the new rule at error.
