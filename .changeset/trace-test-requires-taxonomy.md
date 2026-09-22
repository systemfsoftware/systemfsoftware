---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": patch
---

New rule `trace-test-requires-taxonomy` at error: a file named `*.trace.test.ts` is a trace spec, and a trace spec cannot quietly assert HTTP status. The rule requires at least one import binding from `@systemfsoftware/trace-spec`, forbids terminating a case on an HTTP status or response-body assertion (`expect(res.status).toBe(200)`, `expect(response.body)...`), and forbids raw emit calls (`startSpan`, `spanBuilder`, `startActiveSpan`) inside a trace spec. `test-suffix-outside-src` admits `*.trace.test.ts` as the third behaviour suffix in the same change, so a correctly named trace spec is not rejected by the placement rule, and `@systemfsoftware/oxlint-config-recommended` turns the rule on at error.
