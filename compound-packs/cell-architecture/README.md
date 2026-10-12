# Cell Architecture Compound Pack

Architectural invariants and design law for structuring systems with `@systemfsoftware/effect-cell-types` and Effect-TS.

Every interaction with the outside world is an authored unit called a **Cell**: a pure core enclosed by a typed imperative shell.

Rules in this pack govern:

- The typed five-phase sandwich chain (`read → decode → decide → encode → write`).
- Pure decision workflows with cyclomatic complexity 1 (`Workflow.make`).
- Lifecycles as decisions: a closed tagged union advanced by `Match` over state × command, with a typed refusal per illegal pair, and no state-machine library reachable from a decide body (`pure-decision-workflows`).
- Shell state machines: a closed event-to-target `/fsm` table in a service adapter module, total over its events, read by atoms only through the service (`shell-machines-follow-events`).
- The four-channel contract (`I`, `A`, `E`, `R`).
- Total schema decoding at boundaries (`decode-never-cast`).
- Algebraic cell composition (`Cell.andThen`, `Cell.zip`).
- Capability contracts (`*.service.ts`), layer provisioning tiers, and single-site binding at the composition root.
- Scoped resource lifecycles (`Scope`) with escalating finalizers.
- Staged lawful blueprint builders and blueprint-vs-handle duality.
- Handle state privacy and pipeable dual parity.
- Single primary namespace barrels.
- Running a read-decide-save that protects a non-confluent invariant inside one serializable unit of work, retried whole on a serialization failure (`store-serializable-unit-of-work`).
- A store's decision-serving reads and saves as operations on a unit handle that only the store's unitOfWork mints (`store-unit-of-work-handle`).
