---
"@systemfsoftware/oxlint-plugin-effect-schema": minor
---

A recursive schema union whose cycle carries six or more `Schema.suspend` members now fails a new rule in the recommended set. Hoist the cycle to a single `Schema.suspend` at the recursion point, where the members reference the union schema directly, or declare the budget with `terminatingRecursion`.
