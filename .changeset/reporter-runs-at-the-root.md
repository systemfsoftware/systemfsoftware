---
"@systemfsoftware/stryker-js": major
---

`ReporterService.onMutationTestReportReady` may now require `FileSystem` and `Path` in its effect's service channel. A host that runs this handler must provide both services; reporter implementations that need neither are unaffected. Implementations whose return type is annotated explicitly must widen the annotation to include the new requirements; implementations with an inferred return type are unaffected.
