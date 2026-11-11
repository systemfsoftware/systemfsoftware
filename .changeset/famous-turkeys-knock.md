---
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-spec-runtime": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/oxlint-plugin-cell-architecture": patch
"@systemfsoftware/oxlint-plugin-dmmf-workflow": patch
"@systemfsoftware/oxlint-plugin-effect-platform": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-test-discipline": patch
"@systemfsoftware/oxlint-config-cell-architecture": patch
"@systemfsoftware/oxlint-config-dmmf": patch
"@systemfsoftware/oxlint-config-recommended": patch
"@systemfsoftware/oxlint-config-rule-authoring": patch
"@systemfsoftware/vitest": patch
"@systemfsoftware/effect-schema-discovery": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/conformance-spec": patch
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/effect-sim-kernel": patch
"@systemfsoftware/trace-spec": patch
"@systemfsoftware/trace-taxonomy": patch
---

Hold the oxlint toolchain at ~1.89.0 (was ~1.93.0). The `oxlint-config-*` packages' oxlint peer range moves to ~1.89.0, and the oxlint-plugin packages' oxlint and @oxlint/plugins dependency range moves to ~1.89.0. Rules and presets are unchanged.
