---
"@systemfsoftware/effect-schema-law": minor
---

ruleOfSchemas takes an optional third argument, { runs }, that pins both of a schema's codec laws to that property budget instead of the configured default — for schemas whose round trip is too heavy per run to finish the CI tier inside the test timeout.
