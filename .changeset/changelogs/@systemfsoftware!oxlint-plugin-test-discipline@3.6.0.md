## 3.6.0

### Minor Changes

- New rule `differential-test-requires-harness` (recommended, error): a `.differential.test.ts` file must import and invoke `@systemfsoftware/differential-spec` (`Differential.compare` / `Metamorphic.on`) and must not call raw test runners. `test-suffix-outside-src` now sanctions the `.differential.test.ts` altitude alongside `.integration.test.ts`, and `property-file-purity` treats differential files as property files.

- Publish standalone domain-aligned oxlint plugins and shareable configurations for Effect Schema, DMMF workflows, Effect Platform runtime entrypoints, test discipline, and Cell Architecture.

  Consolidates and supersedes the 12 retired legacy packages (`@systemfsoftware/all`, `@systemfsoftware/oxlint-config`, `@systemfsoftware/oxlint-plugin`, `@systemfsoftware/oxlint-plugin-recommended`, `@systemfsoftware/oxlint-plugin-effect-dmmf`, `@systemfsoftware/oxlint-plugin-effect-native`, `@systemfsoftware/oxlint-plugin-effect-entrypoint`, `@systemfsoftware/oxlint-plugin-effect-workflow`, `@systemfsoftware/oxlint-plugin-property-testing`, `@systemfsoftware/oxlint-plugin-structure`, `@systemfsoftware/oxlint-plugin-tag-discipline`, `@systemfsoftware/oxlint-plugin-test-hygiene`, `@systemfsoftware/oxlint-plugin-test-placement`).
