---
"@systemfsoftware/vitest": minor
---

`@systemfsoftware/vitest/failure` exports `Replay`, the `ReplayFromText` codec for `CONFORMANCE_REPLAY` text (`seed=<n>;path=<steps>`), and `replayOfText`, which reads that text or throws. `ReplayValue.path` is now `ReadonlyArray<number>`, and `providedWorkspaceRoot()` returns a branded `WorkspaceRoot`.
