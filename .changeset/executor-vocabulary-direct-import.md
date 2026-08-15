---
"@systemfsoftware/oxlint-plugin-effect-dmmf": patch
"@systemfsoftware/oxlint-plugin-effect-executor": patch
---

`effect-executor` derives its pure phase and method vocabulary directly from `Cell.vocabulary` at module load and is delivered consumer-side via `jsPlugins`, removing it from the `effect-dmmf` aggregate re-export.
