---
"@systemfsoftware/discern": minor
---

Public `classify` and `rate` constructors, standalone and scoped through `Discern.on(schema)`, refuse a `criteria` label set that is not a finite set of literal labels. A set typed `string`, one with a template label such as `` `tone-${string}` ``, or an empty set is now a compile error, so `.is`, `.atLeast`, `Discern.case`, and `Discern.exhaustive` keep refusing wrong labels. For labels known only at runtime, wrap an effect `Decision.classify` with `Discern.decision` and read it with `Discern.where`, or route with `Discern.Procedure.registry`.
