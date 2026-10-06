---
"@systemfsoftware/upstream-manifest": minor
---

An in-place suite's executed files are no longer recorded: the Vitest JSON report that proves they run arrives through the repeatable `--report <path>` option, so an `inPlace` record is `{ subtree, commit, files }`. The recorded `commit` is held to the subtree's own `git-subtree-split:` trailer, a report path the repository tracks is refused as committed evidence, and a family with `inPlace` records that supplies no report is refused. `runCheck` and `checkFamily` take the reports; `judgeInPlace`, `pinnedCommit`, `reportPaths` and `trackedReports` join the pure surface.
