---
"@systemfsoftware/oxlint-plugin": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
"@systemfsoftware/oxlint-plugin-effect-schema": minor
"@systemfsoftware/oxlint-plugin-structure": minor
"@systemfsoftware/oxlint-config": minor
---

Four new rules ship at error in the recommended configs: zero-arm
unions, effect-returning schema methods, time sources in schema
modules, and hand-curried exports. Existing code that trips one of
these rules now fails lint; migrate to the schema, module, or direct
call shape the messages name.
