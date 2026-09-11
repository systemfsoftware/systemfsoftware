---
"@systemfsoftware/all": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/effect-memfs": patch
"@systemfsoftware/effect-schema-discovery": patch
"@systemfsoftware/effect-schema-extensions": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/hex-schema": patch
"@systemfsoftware/npm-package": patch
"@systemfsoftware/rx-effect": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/stryker-js": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
"@systemfsoftware/stryker-plugins": patch
"@systemfsoftware/stryker-test-contribution": patch
---

The `@systemfsoftware/source` export condition is gone. It resolved to a package's TypeScript sources for editors and in-repo typechecks; each package now exports only its built entry. If your tsconfig sets `customConditions: ["@systemfsoftware/source"]`, or a bundler config names that condition, remove it — resolution falls back to the built entry, which is what every consumer already got.
