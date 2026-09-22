---
"@systemfsoftware/api-extractor": minor
---

The programmatic entry point is now a single `Extractor` namespace: `import { Extractor } from '@systemfsoftware/api-extractor'`. The `runEffect` and `invoke` exports are removed. `Extractor.run(configPath, options)` returns an `Effect` that resolves to `ExtractionPassed` or `ExtractionFailed` — a tagged outcome carrying `errorCount` and `warningCount` — instead of the previous `{ succeeded, errorCount, warningCount }` result record, and config or compiler problems surface as typed `ExtractorError` variants on the error channel. Console output is produced by the `Extractor.layer()` driver, which accepts `stdout` and `stderr` writables so a host can capture a run's console lines. A `typescriptCompilerFolder` that does not contain a usable TypeScript compiler now fails with `TsCompilerLoadError`.

The `TypeScriptDiagnosticError`, `ForgottenExportError`, `ApiReportMismatchError`, `ApiReportMissingError`, and `CircularNamespaceReferenceError` exports are removed. A report that is out of date or missing is now an `ExtractionFailed` outcome, not an error. A config that uses a path placeholder the engine does not recognize now fails with `UnresolvedTokenError` instead of an internal error later in the run.
