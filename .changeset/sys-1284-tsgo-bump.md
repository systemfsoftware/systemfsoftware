---
"@systemfsoftware/oxlint-config-recommended": major
"@systemfsoftware/oxlint-config-cell-architecture": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-rule-authoring": major
"@systemfsoftware/tsconfig": minor
"@systemfsoftware/oxlint-plugin-cell-architecture": patch
"@systemfsoftware/oxlint-plugin-dmmf-workflow": patch
"@systemfsoftware/oxlint-plugin-effect-platform": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-test-discipline": patch
"@systemfsoftware/conformance-spec": patch
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/effect-schema-discovery": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/effect-sim-kernel": patch
"@systemfsoftware/effect-spec-runtime": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/trace-spec": patch
"@systemfsoftware/trace-taxonomy": patch
"@systemfsoftware/vitest": patch
"@systemfsoftware/omp-typescript-discipline": none
"@systemfsoftware/stryker-config": none
"@systemfsoftware/tsdown-config": none
"@systemfsoftware/vitest-config": none
---

Move the toolchain to `@effect/tsgo` 0.67.7 and oxlint `~1.93.0`. The `oxlint-config-*` packages now peer on oxlint `~1.93.0` (was `~1.90.0`), `oxlint-config-recommended` depends on `@effect/tsgo` `^0.67.7` and reports `effecttsgo/match-to-result-or-option` at error, and the `tsconfig` Effect presets set `matchToResultOrOption` to `error`.
