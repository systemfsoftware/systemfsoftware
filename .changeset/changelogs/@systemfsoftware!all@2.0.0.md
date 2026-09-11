## 2.0.0

### Major Changes

- The preset enforces a cyclomatic-complexity ceiling. Every function in a package's source directory is limited to a complexity of 2, and every function in a workflow file to 1; test files are not limited.

  A project that already has branching beyond those values will see new errors on its next lint run. The measured ceiling uses the modified complexity variant, in which one `switch` costs a single point regardless of how many `case` clauses it has.

### Minor Changes

- `vitest/no-standalone-expect` is no longer enabled by the preset.

  The rule reports an `expect` outside a `test` or `it` block, and oxlint turns it on by
  default whenever the `vitest` plugin is loaded. A Given/When/Then suite builds its `it`
  blocks at runtime, so the linter reads a step's `expect` as standalone and reports an
  assertion that does run. The preset now sets the rule `off`, and enables it nowhere.

  A project that wants the rule back names it in its own config; a project that never
  enabled it stops seeing the finding.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin@4.0.0
