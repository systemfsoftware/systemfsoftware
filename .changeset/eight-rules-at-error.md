---
"@systemfsoftware/oxlint-plugin": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
"@systemfsoftware/oxlint-plugin-effect-native": minor
"@systemfsoftware/oxlint-plugin-effect-schema": minor
"@systemfsoftware/oxlint-plugin-structure": minor
"@systemfsoftware/oxlint-config": minor
---

Eight new rules ship at error in the recommended configs: zero-arm
unions, effect-returning schema methods, time sources in schema
modules, schema field mutation, hand-curried exports, four-plus
positional signatures, mutable options fields, and providing a service
captured from an enclosing function. Existing code that trips one of
these rules now fails lint; migrate to the options-object, dual, or
rides-R shapes the messages name.
