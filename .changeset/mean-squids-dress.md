---
"@systemfsoftware/oxlint-plugin-effect-schema": minor
---

schema-filter-constructive-generation now reports a filter on a Struct, Record, TaggedStruct or TaggedRecord receiver as filterResidualUndeclared unless its annotations declare how it generates: the literal arbitrary: { residual: true } for a dense invariant, or an arbitraryConstraint with minProperties / maxProperties. Previously every struct-level filter passed silently, contrary to the rule's documentation. Data-last Schema.check(f) inside .pipe(), inside pipe(schema, ...), or applied to a schema now takes its receiver from that schema.
