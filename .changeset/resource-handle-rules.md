---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-recommended": major
---

Seven rules for `Resource` and `Handle` cell kinds are enabled at `error` in the recommended configurations: `kind-file-construction`, `kind-construction-location`, `kind-file-declares-no-service`, `kind-file-holds-no-module-state`, `handle-imports-no-resource`, `cell-file-owns-no-lifecycle`, and `handle-driver-confinement`. Resource and handle files must build their kind with its constructor, declare no service, and hold no module-level mutable state; cell files must not register a release or close a scope; and a handle's driver must stay inside its definition. Projects with resource, handle, or cell files may see new errors.
