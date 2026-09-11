## 1.2.0

### Minor Changes

- `vitest/no-standalone-expect` is no longer enabled by the preset.

  The rule reports an `expect` outside a `test` or `it` block, and oxlint turns it on by
  default whenever the `vitest` plugin is loaded. A Given/When/Then suite builds its `it`
  blocks at runtime, so the linter reads a step's `expect` as standalone and reports an
  assertion that does run. The preset now sets the rule `off`, and enables it nowhere.

  A project that wants the rule back names it in its own config; a project that never
  enabled it stops seeing the finding.
