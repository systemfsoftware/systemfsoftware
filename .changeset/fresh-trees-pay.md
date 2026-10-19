---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

Two new rules, enrolled in `recommended` at `error`.

- `shell-machine-follows-events` refuses a `createFSM` config from `@systemfsoftware/xstate/fsm` with a key its level does not take (machine: `id`, `initial`, `context`, `states`; state: `on`; transition: `target`, `context`), a transition that is not a fixed target or an event copy, a state missing an event another state handles, or a shape it cannot read. It also refuses a root `createMachine`, a dynamic import or re-export of the family, and an exported factory value, even inside an exported record or array or returned by a function.
- `atoms-read-services` refuses a value family import in an atom module and any value import of the family's React bindings; type-only imports stay allowed.
- Both rules judge production files only: a test file (`*.test.ts`, `*.spec.ts`, `*.tst.ts`) exercises the machine as a fixture and stays unjudged.

To migrate, keep each machine beside its service as a closed table naming every event in every state, and expose plain values for atoms to read.
