---
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`schema-file-imports-pure-modules-only` reports a value import, `import()` or re-export of the state-machine family in a `*.schema.ts`: `xstate` and its subpaths, `@xstate/*`, and `@systemfsoftware/xstate` with its subpaths and its `@systemfsoftware/xstate-*` sibling packages. Every other `@systemfsoftware/*` package stays allowed, and a type-only import stays free. To migrate, build the machine in the service adapter module that uses it.
