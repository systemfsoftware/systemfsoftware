---
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
"@systemfsoftware/oxlint-plugin-effect-schema": minor
---

A new recommended rule, schema-filter-constructive-generation, reports a locally declared Effect Schema filter that carries no constructive generation hint when it is used in a check. Add arbitrary.constraint or arbitrary.candidate to the filter, or give the schema a toArbitrary override before the check, to clear the report.
