---
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-cell-architecture": major
---

The named `ignorePatterns` export is removed. Import it from `@systemfsoftware/oxlint-config-rule-authoring` instead, which now owns the one list every preset carries, or read `ignorePatterns` from the preset's default config.
