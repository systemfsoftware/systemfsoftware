---
"@systemfsoftware/stryker-plugins": minor
---

Withdraw the ignorer decision functions from the plugin entries. `decideInSourceTestIgnore`, `IN_SOURCE_TEST_IGNORED` and `isInSourceTestGuard` were exported so tests could avoid a deep import; the tests now sit beside the cell.
