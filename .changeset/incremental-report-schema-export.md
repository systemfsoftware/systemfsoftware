---
'@systemfsoftware/stryker-js-platform-node': patch
---

Export `IncrementalReportSchema` — the decoder for an on-disk incremental report. Adopters who read the file the engine wrote (persisted state, tooling, or a next run) now decode it through the same schema the engine validates against, instead of hand-parsing its shape. `schemaVersion`, `thresholds`, `files`, and `testFiles` are validated on read; unknown keys are preserved.
