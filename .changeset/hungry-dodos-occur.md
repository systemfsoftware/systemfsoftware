---
"@systemfsoftware/conformance-spec": minor
"@systemfsoftware/differential-spec": minor
"@systemfsoftware/effect-cell-types": minor
"@systemfsoftware/effect-gherkin-spec": minor
"@systemfsoftware/trace-spec": minor
---

A class declared with `Schema.Class`, `Schema.TaggedClass` or `Schema.TaggedError` now carries a nominal brand in its type, so an object literal with the same fields no longer satisfies the class's instance type. Construct the class instead.
