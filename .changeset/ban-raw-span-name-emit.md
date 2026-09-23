---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": patch
---

New rule `ban-raw-span-name-emit` at error: a raw span name can no longer enter through an emit API. Calls to `startSpan`, `spanBuilder`, or `startActiveSpan` — bare or as a member call — are flagged when the first argument is a string literal or a template literal, interpolated templates included. The declared-span spelling is untouched: `Span.declare({ id, name, attrs })` and the `start(attrs)` it returns never trigger the rule, and emit calls given a dynamic name are left alone. The recommended preset enables it at error.
