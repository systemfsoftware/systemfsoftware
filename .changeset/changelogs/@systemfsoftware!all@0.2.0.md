## 0.2.0

### Minor Changes

- New package: the whole stack in one install, plus a ready-made oxlint configuration.

  Installing it brings in every published `@systemfsoftware/*` package at versions known to
  work together, and its default export is an oxlint config that turns on the built-in
  `correctness` category and every rule this architecture recommends — the workflow, schema,
  test-placement, property-testing, hygiene, entrypoint and cell-vocabulary tiers — each at
  `error`:

  ```ts
  // oxlint.config.ts
  import all from '@systemfsoftware/all'

  export default all
  ```

  `effect`, `oxlint`, `oxlint-tsgolint` and `typescript` are required peers, so your project
  keeps one copy of each. `oxlint-tsgolint` is the engine the type-aware rules run on: without
  it, the first lint run stops at "Failed to find tsgolint executable". Framework-specific
  peers — React, Vitest, Vite, Storybook and the rest — are optional, and nothing warns about
  the ones you skip.

  The rules are type-aware, so the files you lint must be covered by a `tsconfig.json`.
  Without one, roughly half of them produce no diagnostics while still reading as enabled.

  `rules`, `plugins` and `ignorePatterns` are also exported by name, for composing instead of
  extending. Every package remains published on its own; reach for this one when you want the
  set rather than one library

### Patch Changes

- Drops the dependency on `@systemfsoftware/effect-purity-law`, a member that was never published, from the umbrella's dependency set. Installing the umbrella no longer tries to resolve a package that does not exist on the registry.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Updated dependencies:
  - @systemfsoftware/arethetypeswrong-cli@2.0.0
  - @systemfsoftware/arethetypeswrong-core@2.0.0
  - @systemfsoftware/effect-atom@1.0.0
  - @systemfsoftware/effect-atom-react@0.6.0
  - @systemfsoftware/effect-cell-types@2.0.0
  - @systemfsoftware/effect-daemon-spec@1.0.0
  - @systemfsoftware/effect-gherkin-spec@1.0.0
  - @systemfsoftware/effect-schema-extensions@0.8.0
  - @systemfsoftware/effect-schema-law@0.7.0
  - @systemfsoftware/omp-agent-discipline@2.0.0
  - @systemfsoftware/omp-claude-compat@2.0.0
  - @systemfsoftware/oxlint-plugin@1.0.0
  - @systemfsoftware/oxlint-plugin-effect-dmmf@2.0.0
  - @systemfsoftware/oxlint-plugin-effect-schema@2.0.0
  - @systemfsoftware/oxlint-plugin-effect-workflow@2.0.0
  - @systemfsoftware/oxlint-plugin-test-placement@2.0.0
  - @systemfsoftware/rx-effect@0.6.0
  - @systemfsoftware/storybook-gherkin@1.0.0
  - @systemfsoftware/stryker-js-cli@2.0.0
  - @systemfsoftware/stryker-js-mutation-run@2.0.0
  - @systemfsoftware/stryker-js-plugin-api@1.0.0
  - @systemfsoftware/stryker-plugins@0.12.0
