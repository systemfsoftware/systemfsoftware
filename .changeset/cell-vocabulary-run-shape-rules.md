---
"@systemfsoftware/oxlint-plugin-cell-vocabulary": minor
---

Two new rules ship at error in the recommended config.

`no-two-run-chain` flags code that runs one Cell and hands its response to a
second `Cell.run` inside the same function — the hand-sequenced pipeline. Compose
the cells with `Cell.andThen` into one spine and run the composed cell once.

`no-platform-provide-service-on-run` flags a `Cell.run` that carries a
per-run `Effect.provideService`. Provide the service once at the composition
root with `Cell.provide`, and leave `Cell.run` bare at the edge; a service
method that wraps an inner run in `Effect.gen` may still provide at its own
boundary.
