---
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`schema-file-imports-pure-modules-only` reports a value import, `import()`, `require()` (including `import ... = require(...)`) or re-export of the state-machine family in a schema file: `xstate` and its subpaths, `@xstate/*`, and `@systemfsoftware/xstate` with its subpaths and `@systemfsoftware/xstate-*` packages. Every other `@systemfsoftware/*` package stays allowed, and type-only imports stay free. Inside an `import.meta.vitest` block a family import named by a string is reported too; a computed specifier there stays exempt, as any test-only dynamic import does. To migrate, build the machine in the service adapter module that uses it.
