---
"@systemfsoftware/oxlint-plugin-cell-vocabulary": major
---

The recommended config gains two error rules. `no-two-run-chain` reports a second `Cell.run` in one function body whose input is the success of an earlier `Cell.run`: compose the cells with `Cell.andThen` (or `Cell.zip`) and run once. `no-platform-provide-service-on-run` reports `Effect.provideService` of `FileSystem` or `Path` applied to the effect a `Cell.run` returns: provide them once as a layer at your composition root.
