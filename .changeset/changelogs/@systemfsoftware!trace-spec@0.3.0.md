## 0.3.0

### Minor Changes

- Requires `@systemfsoftware/vitest` installed under the `@effect/vitest` name (`"@effect/vitest": "npm:@systemfsoftware/vitest"`) in place of the upstream package. `Case.prop` checks the stimulus it is handed on every run and pins the run's input, so a stimulus that ignores its input fails; the trace dump path is annotated on the failing test.

### Patch Changes

- The observation window is built on the `Blueprint` and `Handle` kinds, with unchanged behaviour. The blueprint's `TypeId` is now exported as a value.

- Updated dependencies:
  - @systemfsoftware/effect-spec-runtime@0.2.0
