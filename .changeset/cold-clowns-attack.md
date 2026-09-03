---
"@systemfsoftware/stryker-js-engine": major
---

Decision channels are now tagged unions of at least two Schema tagged classes sharing one family TypeId: the dry-run observation splits into DryRunPassed and DryRunFailed, the mutation-run verdict becomes three variants, and shouldKeepTempDir accepts any failure channel instead of only S.SchemaError
