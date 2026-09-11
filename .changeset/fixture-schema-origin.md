---
"@systemfsoftware/oxlint-plugin-property-testing": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
---

A new rule in the property-testing preset reports a recursive schema union assembled inline inside an in-source test block or a test file. A recursive fixture must enter through a named local builder or an imported helper, or its recursion point must declare its generation with a visible derivation or a declared ceiling; outside test scope the rule is silent.
