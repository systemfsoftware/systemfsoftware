---
"@systemfsoftware/stryker-js": major
---

`ReporterService.onMutationTestReportReady` may now require `FileSystem` and `Path` in its effect's service channel. A host that runs this handler must provide both services; reporter implementations that need neither are unaffected.
