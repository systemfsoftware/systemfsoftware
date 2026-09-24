---
"@systemfsoftware/oxlint-plugin-test-discipline": patch
---

`prop-generated-law-duplicate` and `in-source-test-targets-private` accept the lawful `it.prop(name, { of, subject }, holds)` form: the subject the predicate is handed counts as the code under test. `pbt-naming` accepts `⊨` (satisfies a declared model) as a relation, `damp-test-naming` skips type-test files, and `test-suffix-outside-src` leaves packages that drive the test runner itself to their plain test files.
