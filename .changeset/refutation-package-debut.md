---
"@systemfsoftware/effect-schema-refutation": minor
---

Property-test what an Effect `Schema` rejects, and find out whether you have missed anything.

`refutes(schema, generators)` registers a refusal property for each named generator, a discrimination property proving every rejection is explained by some weakening of the schema, and an adequacy check that fails when a constraint the schema enforces has no generator refusing it. `scanObligations` and `obligationsOf` report those constraints directly, and `adequacyReport` returns the verdict without registering anything.

A schema's generated laws draw their inputs from the schema itself, so they only ever exercise values it accepts. These properties cover the other half.

Previously part of `@systemfsoftware/effect-schema-law`.
