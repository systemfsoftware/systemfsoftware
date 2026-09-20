---
"@systemfsoftware/effect-schema-law": minor
"@systemfsoftware/effect-schema-recursion-budget": minor
"@systemfsoftware/oxlint-plugin-effect-schema": minor
"@systemfsoftware/oxlint-plugin-property-testing": patch
---

A `recursionBudget` annotation materializes as `toCodecArbitrary`. Replace a hand-written `toArbitrary` derivation with `toCodecArbitrary`. Generation depth follows `maxDepth`.
