---
"@systemfsoftware/all": none
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
"@systemfsoftware/oxlint-plugin": none
"@systemfsoftware/oxlint-plugin-cell-vocabulary": none
"@systemfsoftware/oxlint-plugin-effect-dmmf": none
"@systemfsoftware/oxlint-plugin-effect-entrypoint": none
"@systemfsoftware/oxlint-plugin-effect-schema": none
"@systemfsoftware/oxlint-plugin-effect-workflow": none
"@systemfsoftware/oxlint-plugin-property-testing": none
"@systemfsoftware/oxlint-plugin-test-hygiene": none
"@systemfsoftware/oxlint-plugin-test-placement": none
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
"@systemfsoftware/arethetypeswrong": none
"@systemfsoftware/arethetypeswrong-cli": none
---

Vitest test tooling is now fully cataloged: every vitest-family dependency in the workspace resolves through the shared `pnpm-workspace.yaml` catalog at the `^4` range instead of per-package literal pins, so the runner and its `@vitest/*` packages always resolve as one instance. Published code, exports, and behaviour are unchanged; the change is devDependency and catalog declarations only.
