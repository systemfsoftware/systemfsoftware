---
"@systemfsoftware/oxlint-plugin-property-testing": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
---

A new `prop-fixture-schema-origin` rule in `@systemfsoftware/oxlint-plugin-property-testing` reports a recursive schema union assembled inline inside an `import.meta.vitest` in-source block or a `*.test.ts` file. A recursive fixture must enter through a named local builder call or an imported helper such as `terminatingRecursion`, or carry a visible `toArbitrary` annotation; outside test scope the rule is silent.
