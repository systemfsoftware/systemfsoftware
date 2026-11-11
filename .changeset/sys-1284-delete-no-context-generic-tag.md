---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-config-cell-architecture": patch
"@systemfsoftware/oxlint-config-recommended": patch
---

Removes the `no-context-generic-tag` rule and its entry in `configs.recommended`. Effect 4 has no `Context.GenericTag`, so `tsc` already refuses every use of it; declare services with `Context.Service`. A config that names `@systemfsoftware/oxlint-plugin-cell-architecture/no-context-generic-tag` must drop the entry.
