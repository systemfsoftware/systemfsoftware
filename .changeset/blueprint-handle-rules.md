---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

Seven rules for `Blueprint` and `Handle` cell kinds are enabled at `error` in the recommended configurations: `kind-file-construction`, `kind-record-minted-by-kind`, `kind-typeid-by-symbol-for`, `kind-file-declares-no-service`, `kind-file-holds-no-module-state`, `handle-exports-guard`, and `handle-definition-stays-private`. Blueprint, handle, and cell files must be built with the kinds, hold no module-level mutable state, and keep a handle's driver inside its definition. A file still carrying the retired resource suffix is reported with the fix to rename it to the blueprint suffix.
