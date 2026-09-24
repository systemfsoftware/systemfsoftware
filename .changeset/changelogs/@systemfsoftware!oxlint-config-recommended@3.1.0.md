## 3.1.0

### Minor Changes

- The recommended config now enables the test-discipline rules it bundles. Before this release it loaded the plugin but turned none of its rules on, so Gherkin-only behaviour tests, test naming, test-file placement, and the differential and conformance harness rules went unchecked. Expect new lint errors in test files that break those rules.

### Patch Changes

- `@systemfsoftware/differential-spec` depends on and imports `@systemfsoftware/vitest` by its own name instead of through an `@effect/vitest` alias. `@systemfsoftware/oxlint-config-recommended` enables the test-discipline rule under its new id `vitest-from-systemfsoftware-vitest`. `@systemfsoftware/vitest` documentation examples import from `@systemfsoftware/vitest`.

  The lawful runner is published under its own name, `@systemfsoftware/vitest`, starting at `0.1.0`, so peers declared as `^0.1.0` accept its patch releases.

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin-test-discipline@4.0.0
