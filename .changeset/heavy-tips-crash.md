---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`make-body-purity` reports more inside a `Workflow.make` decide body.

- A module-scope `const` or class the body references is judged by what its initializer or class body references, so an I/O import, `fetch` or module state reached through one is reported. An object record whose keys are all nameable is judged by the members the body calls or reads.
- A binding from the state-machine family is reported as `stateMachineImportReference`: `xstate` and its subpaths, `@xstate/*`, and `@systemfsoftware/xstate` with its subpaths and `@systemfsoftware/xstate-*` packages.
- `Map`, `Set`, `WeakMap` and `WeakSet` are benign builtins: reading a module-scope collection passes; writing to one is still a module mutation.

To migrate, decide with `Match` over a closed tagged union in the decide body, keep state machines in a service adapter module, and move schema classes a decision declares into a schema file beside the workflow.
