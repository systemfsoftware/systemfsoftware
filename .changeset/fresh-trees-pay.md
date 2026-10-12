---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

Two new rules, enrolled in `recommended` at `error`.

- `shell-machine-follows-events` refuses a `createFSM` config from `@systemfsoftware/xstate/fsm` (direct or through `setup`) that holds a key beyond `id`, `initial`, `context`, `states`, `on` and `target`, a transition that is not a fixed target or an event copy, a state missing an event another state handles, or a shape it cannot read. It also refuses a root `createMachine` and a dynamic import or re-export of the family.
- `atoms-read-services` refuses a family import in an atom module and any import of the family's React bindings.

To migrate, keep each machine beside its service as a closed table naming every event in every state, and expose plain values for atoms to read.
