## 5.1.0

### Minor Changes

- A new recommended rule, schema-filter-constructive-generation, reports an Effect Schema filter that carries no constructive generation hint when it is used in a check or exported from a module. Add arbitrary.constraint or arbitrary.candidate to the filter, or give the schema a toArbitrary override before the check, to clear the report.

- A new recommended rule, schema-checked-element-named, reports a checked schema node passed inline as a collection combinator element. Bind the checked chain to a module-scope const and pass the name to the combinator to clear the report.

- New rule `schema-filter-constructive-generation` joins the recommended preset. A schema filter declared in the linted file and passed to `.check()` must carry constructive-generation metadata — `arbitrary.constraint` or `arbitrary.candidate` — or the schema must carry a `toArbitrary` override ahead of the check. A filter with neither generates its samples by rejection sampling, so property suites run far below their sampled strength. When the rule fires, add the metadata key your predicate supports; a function-valued `arbitrary` on a filter is the retired replacement form and now reports as well.
