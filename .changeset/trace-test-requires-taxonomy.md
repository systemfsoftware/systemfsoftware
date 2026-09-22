---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": patch
---

New rule `trace-test-requires-taxonomy` at error: a test file named with the `trace.test` suffix is a trace spec, and a trace spec cannot quietly assert HTTP status. The rule requires at least one import binding from `@systemfsoftware/trace-spec`, forbids raw emit calls (`startSpan`, `spanBuilder`, `startActiveSpan`), and forbids terminating a case on an HTTP status or body assertion in any of these shapes: `expect(res.status)`, `toHaveProperty('status')` (also `statusText`, `body`, and dotted paths under them), or an object matcher (`toMatchObject`, `toEqual`, `toStrictEqual`, `expect.objectContaining`) whose object literal carries one of those keys, including through `.resolves`, `.rejects`, and `.not`. `test-suffix-outside-src` now admits the `trace.test` suffix. The recommended preset enables the new rule at error.
