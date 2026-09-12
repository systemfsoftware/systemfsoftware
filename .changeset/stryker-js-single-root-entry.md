---
"@systemfsoftware/stryker-js": major
---

All subpath entry points are removed; the package exports one root specifier that enumerates every published symbol exactly once.

`@systemfsoftware/stryker-js/Checker`, `/Schema`, `/Run`, and every other concept specifier are gone. Import the same symbols from `@systemfsoftware/stryker-js` directly. Two names changed while the vocabulary merged into one surface:

- the machine-stream result type `MutantResult` is now `RunMutantResult` (the serialized report shape keeps the name `MutantResult`);
- the reporter barrel `./Reporter` merged into `ReporterEvent`: `ReporterFailed` now lives beside the event classes, and the unused `REPORTER_SCHEMA_VERSION` constant is deleted.

Duplicate publications of `MutantStatus`, `Position`, `Location`, and their schema values now resolve to the report-format home, so every symbol has exactly one import path.
