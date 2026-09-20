# Cell Architecture Compound Pack

A Compound Pack codifying prescriptive rules for Functional Core, Imperative Shell (FCIS) and Cell Architecture in Effect-TS systems.

## Overview

Cell Architecture structures applications into two distinct domains:

1. **The Pure Core**: Deterministic domain decisions modeled as total, single-path expressions (`Workflow.make`) that map Schema-validated commands to branded tagged decision unions or tagged domain errors (`Result<Decision, Error>`).
2. **The Imperative Shell**: Thin boundary layers that interact with the outside world (network, disk, clock, storage) and sequence operations through typed I/O continuation chains (`Sandwich.read -> decode -> decide -> encode -> write`).
3. **Inward Dependencies**: Infrastructure, transports, and adapters depend on domain contracts; domain logic never imports infrastructure.

## Rules in this Pack

- `io-sandwich-sequence.md`: Every outside interaction follows the I/O sandwich (read -> transform -> write) with no interleaved I/O.
- `pure-decision-core.md`: Domain decisions are pure expressions with cyclomatic complexity 1 and exhaustive dispatch.
- `workflow-constructor-boundary.md`: All workflows must be instantiated through `Workflow.make` with a Schema class command value.
- `workflow-channel-contracts.md`: Decision channels must be multi-variant tagged unions with a shared family brand, and errors must be `S.TaggedError`.
- `ports-separate-from-layers.md`: Capability ports must be declared in separate modules from concrete Layer implementations.
- `cell-pipeline-composition.md`: Cell pipelines must compose via typed Sandwich continuation chains or Cell Do-notation.
- `decode-never-cast.md`: Outside boundary data must be decoded into validated domain types, never asserted with type casts.
- `dependencies-point-inward.md`: Dependencies must point inward from the imperative shell to the pure core.
