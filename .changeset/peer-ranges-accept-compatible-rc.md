---
'@systemfsoftware/all': patch
'@systemfsoftware/arethetypeswrong-cli': none
'@systemfsoftware/arethetypeswrong-core': none
'@systemfsoftware/effect-atom': patch
'@systemfsoftware/effect-atom-react': patch
'@systemfsoftware/effect-cell-types': patch
'@systemfsoftware/effect-daemon-spec': patch
'@systemfsoftware/effect-gherkin-spec': patch
'@systemfsoftware/effect-memfs': patch
'@systemfsoftware/effect-schema-extensions': patch
'@systemfsoftware/effect-schema-law': patch
'@systemfsoftware/effect-schema-vite': patch
'@systemfsoftware/hex-schema': patch
'@systemfsoftware/omp-agent-discipline': patch
'@systemfsoftware/omp-claude-compat': patch
'@systemfsoftware/omp-typescript-discipline': none
'@systemfsoftware/oxlint-plugin': patch
'@systemfsoftware/oxlint-plugin-cell-vocabulary': patch
'@systemfsoftware/oxlint-plugin-effect-dmmf': none
'@systemfsoftware/oxlint-plugin-effect-entrypoint': patch
'@systemfsoftware/oxlint-plugin-effect-schema': patch
'@systemfsoftware/oxlint-plugin-effect-workflow': patch
'@systemfsoftware/oxlint-plugin-property-testing': patch
'@systemfsoftware/oxlint-plugin-recommended': none
'@systemfsoftware/oxlint-plugin-test-hygiene': patch
'@systemfsoftware/oxlint-plugin-test-placement': patch
'@systemfsoftware/rx-effect': patch
'@systemfsoftware/storybook-gherkin': patch
'@systemfsoftware/stryker-js-cli': none
'@systemfsoftware/stryker-js-mutation-report': none
'@systemfsoftware/stryker-js-mutation-run': patch
'@systemfsoftware/stryker-js-plugin-api': none
'@systemfsoftware/stryker-js-typescript-checker': none
'@systemfsoftware/stryker-js-vitest-runner': none
'@systemfsoftware/stryker-plugins': patch
'@systemfsoftware/tsconfig': none
---

The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.
