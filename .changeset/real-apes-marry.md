---
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`schema-file-imports-pure-modules-only` reports a value import, `import()` or re-export of the state-machine family in a schema file: `xstate` and its subpaths, `@xstate/*`, and `@systemfsoftware/xstate` with its subpaths and `@systemfsoftware/xstate-*` packages. Every other `@systemfsoftware/*` package stays allowed, and type-only imports and re-exports stay free. To migrate, build the machine in the service adapter module that uses it.
