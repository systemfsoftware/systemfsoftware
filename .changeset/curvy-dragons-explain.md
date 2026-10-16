---
"@systemfsoftware/stryker-config": minor
---

`sharedConfig.dryRunTimeoutMinutes` is 60: the initial test run may take up to an hour before Stryker stops it, where Stryker's own default stops it at 5 minutes.

A whole-number `STRYKER_CONCURRENCY` such as `4` now sets `sharedConfig.concurrency` to the number 4, which Stryker accepts; before, it was passed as the string `"4"` and Stryker refused the config. Percentages such as `75%` are passed unchanged.
