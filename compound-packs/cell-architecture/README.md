# Cell Architecture Compound Pack

Architectural invariants and design law for structuring systems with `@systemfsoftware/effect-cell-types` and Effect-TS.

Every interaction with the outside world is an authored unit called a **Cell**: a pure core enclosed by a typed imperative shell.

Rules in this pack govern:

- The typed five-phase sandwich chain (`read → decode → decide → encode → write`).
- Pure decision workflows with cyclomatic complexity 1 (`Workflow.make`).
- The four-channel contract (`I`, `A`, `E`, `R`).
- Total schema decoding at boundaries (`decode-never-cast`) and recursive type suspension.
- Algebraic cell composition (`Cell.andThen`, `Cell.zip`).
- Capability contracts (`*.service.ts`), layer provisioning tiers, and single-site binding at the composition root.
- Scoped resource lifecycles (`Scope`) with escalating finalizers.
- Staged lawful builders and resource-vs-handle duality.
- Handle state privacy and pipeable dual parity.
- Single primary namespace barrels.
