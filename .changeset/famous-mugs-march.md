---
"@systemfsoftware/oxlint-config-recommended": none
"@systemfsoftware/oxlint-config-cell-architecture": none
"@systemfsoftware/oxlint-config-dmmf": none
"@systemfsoftware/oxlint-config-rule-authoring": none
"@systemfsoftware/tsconfig": none
---

No longer distributed. This tool configuration is internal to the systemfsoftware monorepo: it is no longer offered as a workspace tarball or through `lib.mkConsumerStore`, and no further versions are released. Own the configuration in your repository. For the oxlint presets, consume the oxlint plugins they turned on instead: `oxlint-plugin-cell-architecture`, `oxlint-plugin-dmmf-workflow`, `oxlint-plugin-effect-platform`, `oxlint-plugin-effect-schema` and `oxlint-plugin-test-discipline`.
