## 3.0.0

### Major Changes

- Seven rules for `Blueprint` and `Handle` cell kinds are enabled at `error` in the recommended configurations: `kind-file-construction`, `kind-record-minted-by-kind`, `kind-typeid-by-symbol-for`, `kind-file-declares-no-service`, `kind-file-holds-no-module-state`, `handle-exports-guard`, and `handle-definition-stays-private`. Blueprint, handle, and cell files must be built with the kinds, hold no module-level mutable state, and keep a handle's driver inside its definition. A file still carrying the retired resource suffix is reported with the fix to rename it to the blueprint suffix.

### Minor Changes

- The default config now refuses `expect(<predicate>)` asserted against `true` or `false`, and any value import from `vitest` instead of `@effect/vitest`, as errors in every file it lints.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/oxlint-config-cell-architecture@2.0.0
