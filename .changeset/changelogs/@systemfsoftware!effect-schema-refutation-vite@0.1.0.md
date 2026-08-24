## 0.1.0

### Minor Changes

- Assert that every obligation your exported schemas carry is refuted somewhere.

  `inlineRefutationCoverage()` finds the exported Effect `Schema` declarations in your source and generates a test that fails when a constraint one of them enforces has no refusal covering it. List it in `plugins` beside `inlineSchemaTests` from `@systemfsoftware/effect-schema-vite`; each plugin generates its own file, so neither overwrites the other.

  This assertion previously shipped inside that plugin behind an option. It is its own package so that a project wanting only the codec laws installs only the codec laws — and so that turning coverage on is a line in your plugin list rather than a flag whose default decides policy for you.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-schema-law@1.0.0
