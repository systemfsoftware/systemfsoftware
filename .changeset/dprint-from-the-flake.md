---
"@systemfsoftware/arethetypeswrong-cli": none
"@systemfsoftware/arethetypeswrong-core": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/oxlint-plugin-cell-imports": none
"@systemfsoftware/oxlint-plugin-cell-taxonomy": none
"@systemfsoftware/oxlint-plugin": none
"@systemfsoftware/oxlint-plugin-effect-acl": none
"@systemfsoftware/oxlint-plugin-effect-adapter": none
"@systemfsoftware/oxlint-plugin-effect-dmmf": none
"@systemfsoftware/oxlint-plugin-effect-entrypoint": none
"@systemfsoftware/oxlint-plugin-effect-executor": none
"@systemfsoftware/oxlint-plugin-effect-handler": none
"@systemfsoftware/oxlint-plugin-effect-kernel": none
"@systemfsoftware/oxlint-plugin-effect-middleware": none
"@systemfsoftware/oxlint-plugin-effect-observer": none
"@systemfsoftware/oxlint-plugin-effect-policy": none
"@systemfsoftware/oxlint-plugin-effect-schema": none
"@systemfsoftware/oxlint-plugin-effect-shape": none
"@systemfsoftware/oxlint-plugin-effect-state": none
"@systemfsoftware/oxlint-plugin-effect-store": none
"@systemfsoftware/oxlint-plugin-effect-workflow": none
"@systemfsoftware/oxlint-plugin-property-testing": none
"@systemfsoftware/oxlint-plugin-recommended": none
"@systemfsoftware/oxlint-plugin-test-hygiene": none
"@systemfsoftware/oxlint-plugin-test-placement": none
---

Drop the per-package `format` script. dprint is a flake package invoked through the repo's `bin/dprint` wrapper; the per-package script was the one caller that bypassed it.
