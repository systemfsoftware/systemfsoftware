---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`make-body-purity` reports more inside a `Workflow.make` decide body.

- A module-scope `const` or class that the body references is judged by the references inside its initializer or class body. An I/O import, an I/O global such as `fetch`, or module state reached through a module constant or a class is now reported where the body references it.
- A binding imported from the state-machine family is reported under the new message id `stateMachineImportReference`: `xstate` and its subpaths, `@xstate/*`, and `@systemfsoftware/xstate` with its subpaths and its `@systemfsoftware/xstate-*` sibling packages.

To migrate, decide with `Match` over a closed tagged union inside the decide body, keep state machines in a service adapter module, and move a schema class that a decision declares from another package's schema values into a `*.schema.ts` file beside the workflow.
