---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

Two new rules, enrolled in `recommended` at `error`.

- `shell-machine-follows-events` reads every `createFSM` config from `@systemfsoftware/xstate/fsm` (direct, through `setup(...)`, or through a const-held `setup` result). It reports a key other than `id`, `initial`, `context`, `states`, `on` and `target`; a transition that is neither a fixed target nor an event copy; a state that omits an event type another state handles; and a config it cannot read statically. It also reports a root `createMachine` or `setup(...).createMachine`, and a dynamic import or re-export of the state-machine family.
- `atoms-read-services` reports a state-machine-family import, `import()` or re-export in an atom module (one that imports and references `@systemfsoftware/effect-atom` or `@systemfsoftware/effect-atom-react`), and any import of `@xstate/react`, `@systemfsoftware/xstate-react` or `@systemfsoftware/xstate-store-react`.

To migrate, keep each machine in the adapter module beside its `*.service.ts` as a closed table that names every event in every state, send decision results to it as event types, and expose plain values from the service for atoms to read.
