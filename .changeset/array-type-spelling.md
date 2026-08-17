---
"@systemfsoftware/arethetypeswrong-cli": patch
"@systemfsoftware/arethetypeswrong-core": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/effect-memfs": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/oxlint-plugin": patch
"@systemfsoftware/oxlint-plugin-effect-entrypoint": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-property-testing": patch
"@systemfsoftware/oxlint-plugin-test-placement": patch
"@systemfsoftware/rx-effect": patch
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-mutation-run": patch
"@systemfsoftware/stryker-js-plugin-api": patch
"@systemfsoftware/stryker-plugins": patch
---

Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
apart: no exported type changes, only how it is written.
