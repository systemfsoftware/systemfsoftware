---
"@systemfsoftware/stryker-config": major
---

`shardMutate` is removed. Drop `shardMutate(...)` from your config and pass your `mutate` patterns directly; to split a run, use the `plan` command and the `--shard` option of `@systemfsoftware/stryker-js`.

`sharedConfig.ignorePatterns` also ignores the package's committed mutation baseline and its reasons file, so committing a baseline no longer changes the digest Stryker reuses earlier verdicts by.

`sharedConfig.dryRunTimeoutMinutes` is 60: the initial test run may take up to an hour before Stryker stops it, where Stryker's own default stops it at 5 minutes.

A whole-number `STRYKER_CONCURRENCY` such as `4` now sets `sharedConfig.concurrency` to the number 4, which Stryker accepts; before, it was passed as the string `"4"` and Stryker refused the config. Percentages such as `75%` are passed unchanged.
