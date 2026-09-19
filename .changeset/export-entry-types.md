---
"@systemfsoftware/oxlint-plugin": patch
"@systemfsoftware/oxlint-plugin-effect-dmmf": patch
"@systemfsoftware/oxlint-plugin-effect-entrypoint": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-effect-workflow": patch
"@systemfsoftware/oxlint-plugin-property-testing": patch
"@systemfsoftware/oxlint-plugin-recommended": patch
"@systemfsoftware/oxlint-plugin-test-hygiene": patch
"@systemfsoftware/oxlint-plugin-test-placement": patch
"@systemfsoftware/stryker-js-engine": patch
"@systemfsoftware/stryker-js-html-reporter": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
---

Every entry point now names its type declarations explicitly in the published manifest, so a type resolver reads them from the manifest instead of inferring them. Exported names, declarations and behaviour are otherwise unchanged.
