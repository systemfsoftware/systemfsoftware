---
"@systemfsoftware/stryker-js": major
---

The mutation-run and exit-class decision functions moved to plain kernels; the public runMutationTest signature and event surface are unchanged. The public Run subpath drops mutationRunDescription, and shouldKeepTempDir now accepts any failure channel instead of only S.SchemaError
