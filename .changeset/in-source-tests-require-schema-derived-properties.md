---
"@systemfsoftware/oxlint-plugin-test-placement": minor
"@systemfsoftware/oxlint-plugin-property-testing": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
---

Two new lint rules ship enabled and blocking. An in-source test may now contain only property tests, and every property-test generator must be derivable from a declared schema: generators assembled by hand from raw primitives fail lint, and example-style blocks fail lint outright. Upgrading surfaces new errors wherever your codebase still uses those shapes; each diagnostic states the fix — derive the generator from a schema, or delete the block.
