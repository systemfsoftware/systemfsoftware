---
"@systemfsoftware/conformance-spec": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-schema-discovery": none
"@systemfsoftware/effect-schema-law": none
"@systemfsoftware/effect-schema-recursion-budget": none
"@systemfsoftware/effect-schema-vite": none
"@systemfsoftware/effect-sim-kernel": none
"@systemfsoftware/omp-typescript-discipline": none
"@systemfsoftware/oxlint-config-cell-architecture": patch
"@systemfsoftware/oxlint-config-dmmf": patch
"@systemfsoftware/oxlint-config-rule-authoring": patch
"@systemfsoftware/oxlint-plugin-cell-architecture": patch
"@systemfsoftware/oxlint-plugin-dmmf-workflow": patch
"@systemfsoftware/oxlint-plugin-effect-platform": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-test-discipline": patch
"@systemfsoftware/stryker-config": none
"@systemfsoftware/trace-spec": none
"@systemfsoftware/trace-taxonomy": none
"@systemfsoftware/tsconfig": none
"@systemfsoftware/tsdown-config": none
"@systemfsoftware/vitest-config": none
---

The oxlint configs and plugins now require oxlint ~1.93.0 and oxlint-tsgolint 7.0.2006 (and @effect/tsgo ^0.69.0 where they depend on it). The other packages only build and lint with the new tools; what they publish is unchanged.
