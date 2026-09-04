## 5.2.0

### Minor Changes

- Two new recommended rules run against every workflow file. `damp-workflow-stem` requires the file's name to be a hyphenated phrase of two to five lowercase words whose camelCase form equals the file's single export, so a file named for its capability bucket or a bare noun now fails. `workflow-file-make-presence` refuses a workflow file that never constructs its decision with `Workflow.make`. Rename failing workflow files to the decision they make and align each export name, or move a file that owns no decision next to its caller without the workflow suffix.

- A new recommended rule, schema-filter-constructive-generation, reports an Effect Schema filter that carries no constructive generation hint when it is used in a check or exported from a module. Add arbitrary.constraint or arbitrary.candidate to the filter, or give the schema a toArbitrary override before the check, to clear the report.

- A new recommended rule, schema-checked-element-named, reports a checked schema node passed inline as a collection combinator element. Bind the checked chain to a module-scope const and pass the name to the combinator to clear the report.

- The `tests-import-public-api` rule now applies to every file under a package's `tests` or `__tests__` folder — helpers, fixtures, and type tests included — instead of only files whose name ends in `.test` or `.spec`. Any file in those folders that imports the package's own source may start failing lint on upgrade: import the published entry point instead, or remove the test.
