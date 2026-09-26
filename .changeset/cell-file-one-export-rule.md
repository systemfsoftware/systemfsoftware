---
"@systemfsoftware/oxlint-plugin-cell-architecture": minor
---

New `cell-file-exports-cell-only` rule, enabled in the recommended config: a cell file exports exactly one value, its cell. Interfaces and type aliases are free. Move any other value it reports to the module that declares that value's type.
