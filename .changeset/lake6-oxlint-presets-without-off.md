---
"@systemfsoftware/oxlint-config-dmmf": minor
"@systemfsoftware/oxlint-config-recommended": minor
"@systemfsoftware/oxlint-config-rule-authoring": minor
"@systemfsoftware/oxlint-plugin-effect-platform": patch
---

`vitest/no-standalone-expect` is now enforced at `error` instead of disabled. A Gherkin step body that asserts with the runner's `expect` passes, one that asserts anywhere else in the file is reported. Every other allowance this configuration takes is now a narrower rule at `error` rather than a switch-off: `no-restricted-imports` and `effecttsgo/node-builtin-import` still report a Node built-in in source while build-config files are left alone, and the `src/` complexity rule no longer reaches test files. No provided configuration sets a rule to `off`, `allow`, `warn`, or a numeric severity.
