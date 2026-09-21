# Cell Architecture Compound Pack

This pack codifies what code written with `@systemfsoftware/effect-cell-types` must honor.

Every outside interaction is an authored unit called a **Cell**: a five-phase I/O sandwich compiled into a single arrow `Cell<in I, out A, out E, out R>`. The compiler refuses misordered phases, untagged decisions, and unprovided services. This pack supplies the citations and calibration pairs that lint and review use to ensure cells compose lawfully, dependencies point inward, and layers attach only at the root.

## Rules in this Pack

- `sandwich-phase-order.md`: Outside interactions follow the five-phase sandwich chain (`read -> decode -> decide -> encode -> write`).
- `pure-decision-workflows.md`: Decisions inside the sandwich are pure `Workflow` values with cyclomatic complexity 1.
- `four-channel-contracts.md`: The cell's four channels (`I`, `A`, `E`, `R`) separate inputs, outcomes, failures, and service dependencies.
- `pipeline-composition.md`: Cells compose algebraically via `Cell.andThen`, `Cell.zip`, `Cell.gate`, and `Cell.Do`, never through sequential `yield* cell.run()`.
- `layer-provision-boundary.md`: Adapters and services in `R` bind once at the composition root via `Cell.provide`; `cell.run` requires $R = \text{never}$.
- `cross-cell-lifetimes.md`: Cross-cell resource lifetimes close at the process edge via `Effect.scoped`; intermediate scopes are forbidden.
- `ports-separate-from-layers.md`: Capability tags (`Context.Service`) are published separately from concrete implementation layers (`Layer`).
