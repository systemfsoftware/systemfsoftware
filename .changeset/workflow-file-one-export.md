---
"@systemfsoftware/oxlint-plugin-effect-workflow": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": minor
"@systemfsoftware/all": none
"@systemfsoftware/arethetypeswrong": none
"@systemfsoftware/arethetypeswrong-cli": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-gherkin-spec": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/effect-schema-bounded-union": none
"@systemfsoftware/effect-schema-discovery": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/effect-schema-law": none
"@systemfsoftware/effect-schema-vite": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/npm-package": none
"@systemfsoftware/omp-agent-discipline": none
"@systemfsoftware/omp-claude-compat": none
"@systemfsoftware/omp-typescript-discipline": none
"@systemfsoftware/oxlint-plugin-cell-vocabulary": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
"@systemfsoftware/stryker-js": none
"@systemfsoftware/stryker-js-cli": none
"@systemfsoftware/stryker-js-html-reporter": none
"@systemfsoftware/stryker-js-instrumenter": none
"@systemfsoftware/stryker-js-platform-node": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/stryker-plugins": none
"@systemfsoftware/stryker-test-contribution": none
---

Recommended now reports extra non-schema value exports and re-exports from a workflow file.

A single-segment workflow module may publish exactly one non-schema value. Schema declarations and type-only exports stay. Every re-export form is an error, including exporting an imported binding.

If the new diagnostic fires, delete the extra export or import the name from the module that declares it.
