---
"@systemfsoftware/oxlint-plugin-effect-schema": minor
---

New rule `schema-filter-constructive-generation` joins the recommended preset. A schema filter declared in the linted file and passed to `.check()` must carry constructive-generation metadata — `arbitrary.constraint` or `arbitrary.candidate` — or the schema must carry a `toArbitrary` override ahead of the check. A filter with neither generates its samples by rejection sampling, so property suites run far below their sampled strength. When the rule fires, add the metadata key your predicate supports; a function-valued `arbitrary` on a filter is the retired replacement form and now reports as well.
