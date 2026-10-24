---
"@systemfsoftware/effect-schema-law": minor
---

ruleOfSchemas takes an optional third argument, { runs }, that pins both of a schema's codec laws to that property budget instead of the configured default — for schemas whose round trip is too heavy per run to finish the CI tier inside the test timeout. The arguments are now forwarded through an explicit wrapper in both the data-first and the curried form; the previous Function.dual-based signature silently dropped a third argument.
