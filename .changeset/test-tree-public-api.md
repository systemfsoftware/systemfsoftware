---
"@systemfsoftware/oxlint-plugin-test-placement": minor
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
"@systemfsoftware/stryker-js-engine": none
"@systemfsoftware/stryker-js-html-reporter": none
"@systemfsoftware/stryker-js-instrumenter": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/stryker-plugins": none
"@systemfsoftware/stryker-test-contribution": none
---

The `tests-import-public-api` rule now applies to every file under a package's `tests` or `__tests__` folder — helpers, fixtures, and type tests included — instead of only files whose name ends in `.test` or `.spec`. Any file in those folders that imports the package's own source may start failing lint on upgrade: import the published entry point instead, or remove the test.
