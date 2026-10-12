---
"@systemfsoftware/stryker-config": patch
---

`sharedConfig.ignorePatterns` also ignores `/mutation-baseline.json` and `/mutation-baseline.reasons.md`, so committing a mutation baseline no longer changes the digest Stryker reuses earlier verdicts by.
