---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
---

The cell-kind rules (`kind-file-construction`, `kind-file-declares-no-service`, `kind-file-holds-no-module-state`, `kind-record-minted-by-kind`, `handle-definition-stays-private`) now see through `as`, `satisfies`, `!` and type-argument wrappers when they resolve an import origin, so `(Blueprint as typeof Blueprint).make(...)` counts as a construction and a wrapped service or module-state call is judged as the unwrapped one would be.
