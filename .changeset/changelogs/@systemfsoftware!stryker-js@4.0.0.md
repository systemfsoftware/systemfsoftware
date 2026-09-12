## 4.0.0

### Major Changes

- The machine-stream event class `MutantTested` (tag `mutant`) is renamed `RunMutantTested`.

  The reporter-protocol event class keeps the name `MutantTested`; the two classes described different events under one name. Serialized stream output is unchanged — the rename is the exported binding only. If you constructed or matched the machine-stream class, import `RunMutantTested` from `@systemfsoftware/stryker-js/Run`.

- Removed the unused `output-file` and `provided-options` entry points — neither carried vocabulary the rest of the package does not already provide.

  If you imported `output-file`, write the directory and file through your own filesystem service. If you imported the `ProvidedStrykerOptions` alias, use `StrykerOptions` from `@systemfsoftware/stryker-js/Schema` instead.

- All subpath entry points are removed; the package exports one root specifier that enumerates every published symbol exactly once.

  `@systemfsoftware/stryker-js/Checker`, `/Schema`, `/Run`, and every other concept specifier are gone. Import the same symbols from `@systemfsoftware/stryker-js` directly. Two names changed while the vocabulary merged into one surface:

  - the machine-stream result type `MutantResult` is now `RunMutantResult` (the serialized report shape keeps the name `MutantResult`);
  - the reporter barrel `./Reporter` merged into `ReporterEvent`: `ReporterFailed` now lives beside the event classes, and the unused `REPORTER_SCHEMA_VERSION` constant is deleted.

  Duplicate publications of `MutantStatus`, `Position`, `Location`, and their schema values now resolve to the report-format home, so every symbol has exactly one import path.

### Patch Changes

- The recommended oxlint set now carries `workflow-variant-constructed` and `runtime-construction-placement` at `error`, and the make-keyed workflow rules recognize the `Workflow.total` and `Workflow.andThen` constructors as lawful workflow construction.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@8.0.0
