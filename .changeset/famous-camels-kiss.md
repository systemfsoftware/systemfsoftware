---
"@systemfsoftware/conformance-spec": minor
---

A rejected report (`Fail`, `Incomplete` or `OverBudget`) now carries its rendered `explanation`, so asserting `_tag: 'Pass'` on it shows which history and step broke. New `failed`, `incomplete` and `overBudget` constructors build rejected reports.
