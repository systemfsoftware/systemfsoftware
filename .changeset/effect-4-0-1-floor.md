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
"@systemfsoftware/effect-schema-extensions": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/effect-spec-runtime": patch
"@systemfsoftware/hex-schema": patch
"@systemfsoftware/npm-package": patch
"@systemfsoftware/oxlint-config-cell-architecture": patch
"@systemfsoftware/oxlint-config-dmmf": patch
"@systemfsoftware/oxlint-config-recommended": patch
"@systemfsoftware/oxlint-plugin-cell-architecture": patch
"@systemfsoftware/oxlint-plugin-dmmf-workflow": patch
"@systemfsoftware/oxlint-plugin-effect-platform": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/oxlint-plugin-test-discipline": patch
"@systemfsoftware/rx-effect": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/trace-spec": patch
"@systemfsoftware/trace-taxonomy": patch
"@systemfsoftware/vitest": patch
---

The published `effect` and `@effect/*` dependency ranges now start at 4.0.1 (`^4.0.1`, was `^4`), so a consumer resolves at least Effect 4.0.1. `@systemfsoftware/discern` also bundles `@effect/platform-node` and `@effect/platform-node-shared` 4.0.1 instead of 4.0.0.
