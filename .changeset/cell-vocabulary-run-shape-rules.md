---
"@systemfsoftware/oxlint-plugin-cell-vocabulary": minor
---

One new rule ships at error in the recommended config.

`no-two-run-chain` flags code that runs one Cell and hands its response to a
second `Cell.run` inside the same function — the hand-sequenced pipeline. Compose
the cells with `Cell.andThen` into one spine and run the composed cell once.
