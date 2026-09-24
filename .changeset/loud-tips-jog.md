---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

The recommended config now reports two new rules as errors. `sandwich-shell-is-straight-line` refuses branching, loops, `&&`/`||` short-circuits, `Match` pipelines and the `effect` dispatch combinators (`Effect.when`, the `Effect.match` family, `Option.match`, `Result.match`, `Array.match`, `Array.matchLeft`, `Array.matchRight`, `Boolean.match` and `Exit.match`) in the read function and write handlers of a `Sandwich.named(...)` chain, and refuses `Clock` reads in its write handlers; move the decision into the workflow passed to `.decide`, and gather the time in `read`. `medium-owns-no-recovery` refuses `Effect.retry`, `Effect.retryOrElse`, `Effect.forever` and `Stream.retry` inside the ports of a `Supervisor.Medium.make` call from `@systemfsoftware/effect-daemon-spec`, because restarting a child is the supervisor's decision; report the failure and let the supervisor restart it.
