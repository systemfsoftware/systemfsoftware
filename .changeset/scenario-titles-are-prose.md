---
'@systemfsoftware/effect-gherkin-spec': major
'@systemfsoftware/storybook-gherkin': major
'@systemfsoftware/all': none
'@systemfsoftware/arethetypeswrong': none
'@systemfsoftware/arethetypeswrong-cli': none
'@systemfsoftware/effect-atom': none
'@systemfsoftware/effect-atom-react': none
'@systemfsoftware/effect-cell-types': none
'@systemfsoftware/effect-daemon-spec': none
'@systemfsoftware/effect-memfs': none
'@systemfsoftware/effect-schema-bounded-union': none
'@systemfsoftware/effect-schema-discovery': none
'@systemfsoftware/effect-schema-extensions': none
'@systemfsoftware/effect-schema-law': none
'@systemfsoftware/effect-schema-vite': none
'@systemfsoftware/hex-schema': none
'@systemfsoftware/npm-package': none
'@systemfsoftware/omp-agent-discipline': none
'@systemfsoftware/omp-claude-compat': none
'@systemfsoftware/omp-typescript-discipline': none
'@systemfsoftware/oxlint-plugin': none
'@systemfsoftware/oxlint-plugin-cell-vocabulary': none
'@systemfsoftware/oxlint-plugin-effect-dmmf': none
'@systemfsoftware/oxlint-plugin-effect-entrypoint': none
'@systemfsoftware/oxlint-plugin-effect-schema': none
'@systemfsoftware/oxlint-plugin-effect-workflow': none
'@systemfsoftware/oxlint-plugin-property-testing': none
'@systemfsoftware/oxlint-plugin-recommended': none
'@systemfsoftware/oxlint-plugin-test-hygiene': none
'@systemfsoftware/oxlint-plugin-test-placement': none
'@systemfsoftware/rx-effect': none
'@systemfsoftware/stryker-js': none
'@systemfsoftware/stryker-js-cli': none
'@systemfsoftware/stryker-js-html-reporter': none
'@systemfsoftware/stryker-js-instrumenter': none
'@systemfsoftware/stryker-js-platform-node': none
'@systemfsoftware/stryker-js-vitest-runner': none
'@systemfsoftware/stryker-plugins': none
'@systemfsoftware/stryker-test-contribution': none
'@systemfsoftware/tsconfig': none
---

Scenario titles are now enforced as prose at the type level: `scenario` and `scenarioOutline` reject any title that either starts with "Should" (the `Should_[Behavior]_When_[Condition]` unit-test naming convention) or lacks an ASCII space between words (every concatenated-token shape — PascalCase, snake_case, CamelCase — that reads as a unit-test name rather than prose). A rejected title fails to type-check with the rule in the diagnostic. Titles that are not string literals are unaffected.
