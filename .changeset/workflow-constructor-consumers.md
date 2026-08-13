---
"@systemfsoftware/effect-daemon-spec": minor
"@systemfsoftware/omp-claude-compat": patch
"@systemfsoftware/stryker-js-cli": patch
---

Produce every workflow through `Workflow.make`.

`decideRestart`, `interpretHookResult`, and `admitSurvivorsRun` are now built by the constructor rather
than annotated with `Workflow<Command, Decision, Error>`. Each decision is behaviourally identical —
`make` is the identity at runtime — but the channels are now inferred from the decider instead of
asserted by hand, so a total decision resolves to `UninhabitedError` and becomes uncallable rather than
compiling as a workflow that cannot fail.

`effect-daemon-spec` takes a minor bump because the change is consumer-visible beyond its own source:
`@systemfsoftware/effect-cell-types` moves from `devDependencies` to `dependencies`, so installing this
package now installs it. That reclassification is required, not incidental — `make` is a runtime call,
and `scripts/guards/check-runtime-deps.mjs` fails a runtime import declared only as a dev dependency.
`omp-claude-compat` gains the same dependency; `stryker-js-cli` already declared it.

`RestartDecisionWorkflow` survives as a type-only export: one in-repo consumer, its own property test,
references it through `ReturnType<…>`.
