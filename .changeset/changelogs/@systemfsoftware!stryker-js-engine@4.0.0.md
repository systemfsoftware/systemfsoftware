## 4.0.0

### Major Changes

- `ReporterStage` is now an opaque type, and `ReporterAttachment` and `ReporterStreamState` are no longer exported.

  Code that passes a reporter stage between `attachReporterFactories`, `offerReporterEvent`, `offerTerminalReport`, and `closeReporterStage` compiles unchanged. Code that read `stage.attachments` no longer compiles — route through those four operations instead. Reporter containment behavior (a reporter that fails before the terminal report is detached without changing the exit code; a reporter that fails during the terminal report fails the run) is unchanged.

### Patch Changes

- Imports rewired to the collapsed `@systemfsoftware/stryker-js` root entry; each package now co-releases against the root-entry major.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@8.0.0
  - @systemfsoftware/stryker-js@4.0.0
