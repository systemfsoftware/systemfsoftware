---
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
---

Surface `executor-requires-description` through the aggregate plugin.

`effect-dmmf` is the plugin name every cell diagnostic is reported under, so a rule added to `effect-executor` reaches consumers only once it appears here. Its API surface gains one entry — `'executor-requires-description': Rule` — and the rule arrives at error in the recommended config, because `recommendedFrom` promotes whatever each source itself recommends.

Consumers extending the recommended config get a new error-severity rule, which fails a build that carries an unmigrated call site.
