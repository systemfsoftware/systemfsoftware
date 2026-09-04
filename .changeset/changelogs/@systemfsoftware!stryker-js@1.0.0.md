## 1.0.0

### Major Changes

- The console log threshold is now scoped to the run that set it. Two runs in one
  process no longer share it, so a run that lowers its own level can no longer
  quieten another run happening alongside it.

  `setEngineLogLevel` is removed. The level travels with the run.

- `runMutationTest` now requires the run-identity services to be provided by the caller; the effect names them in its requirements channel.

- The public Run subpath's shouldKeepTempDir now accepts any failure channel instead of only S.SchemaError; the runMutationTest signature and event surface are unchanged

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@6.0.0
