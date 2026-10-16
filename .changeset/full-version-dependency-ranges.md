---
"@systemfsoftware/conformance-spec": patch
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/discern": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-daemon-cluster": patch
"@systemfsoftware/effect-daemon-conformance": patch
"@systemfsoftware/effect-daemon-microvm": patch
"@systemfsoftware/effect-daemon-process": patch
"@systemfsoftware/effect-daemon-socket": patch
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/effect-memfs": patch
"@systemfsoftware/effect-microsandbox": patch
"@systemfsoftware/effect-readiness": patch
"@systemfsoftware/effect-schema-discovery": patch
"@systemfsoftware/effect-schema-extensions": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/effect-sim-kernel": patch
"@systemfsoftware/effect-spec-runtime": patch
"@systemfsoftware/hex-schema": patch
"@systemfsoftware/npm-package": patch
"@systemfsoftware/oxlint-config-cell-architecture": patch
"@systemfsoftware/oxlint-config-dmmf": patch
"@systemfsoftware/oxlint-config-recommended": patch
"@systemfsoftware/oxlint-config-rule-authoring": patch
"@systemfsoftware/oxlint-plugin-cell-architecture": patch
"@systemfsoftware/oxlint-plugin-dmmf-workflow": patch
"@systemfsoftware/oxlint-plugin-effect-platform": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-test-discipline": patch
"@systemfsoftware/rx-effect": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/stryker-config": patch
"@systemfsoftware/trace-spec": patch
"@systemfsoftware/trace-taxonomy": patch
"@systemfsoftware/tsdown-config": patch
"@systemfsoftware/vitest": patch
"@systemfsoftware/vitest-config": patch
---

Published dependency ranges now name a full version: `vitest`, `@vitest/*` and `@types/node` ranges start at 5.0.1 and 26.6.2 (were `^5` and `^26`), `typescript` at 7.0.2 (was `^7`) and `playwright` at 1.63.0 (was `^1`). The `vitest` peer dependency of `@systemfsoftware/effect-gherkin-spec`, `@systemfsoftware/effect-schema-law`, `@systemfsoftware/effect-schema-vite`, `@systemfsoftware/effect-spec-runtime`, `@systemfsoftware/storybook-gherkin`, `@systemfsoftware/trace-spec`, `@systemfsoftware/vitest` and `@systemfsoftware/vitest-config` is now `^5.0.1`, so a consumer needs at least Vitest 5.0.1. `@systemfsoftware/trace-spec` depends on `@opentelemetry/semantic-conventions` `^1.43.0` (was `^1.33`).
