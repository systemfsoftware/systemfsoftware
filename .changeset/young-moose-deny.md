---
"@systemfsoftware/effect-schema-law": minor
---

Requires `@systemfsoftware/vitest` installed under the `@effect/vitest` name (`"@effect/vitest": "npm:@systemfsoftware/vitest"`) in place of the upstream package. The round-trip law from `ruleOfSchemas` draws two values and also requires distinct values to stay distinct, so a codec that returns a constant fails it. A schema with exactly one value registers one law marked exempt in place of two. `recursionLaws` adds a law that wrapping a value nests it one level deeper.
