---
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/conformance-spec": none
"@systemfsoftware/differential-spec": none
"@systemfsoftware/discern": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-gherkin-spec": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/effect-microsandbox": none
"@systemfsoftware/effect-readiness": none
"@systemfsoftware/effect-schema-discovery": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/effect-schema-law": none
"@systemfsoftware/effect-schema-recursion-budget": none
"@systemfsoftware/effect-schema-vite": none
"@systemfsoftware/effect-sim-kernel": none
"@systemfsoftware/effect-spec-runtime": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/oxlint-plugin-cell-architecture": none
"@systemfsoftware/oxlint-plugin-dmmf-workflow": none
"@systemfsoftware/oxlint-plugin-effect-platform": none
"@systemfsoftware/oxlint-plugin-effect-schema": none
"@systemfsoftware/oxlint-plugin-test-discipline": none
"@systemfsoftware/oxlint-config-cell-architecture": none
"@systemfsoftware/oxlint-config-dmmf": none
"@systemfsoftware/oxlint-config-recommended": none
"@systemfsoftware/oxlint-config-rule-authoring": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
"@systemfsoftware/trace-spec": none
"@systemfsoftware/trace-taxonomy": none
"@systemfsoftware/vitest": none
---

Build output no longer keeps files from earlier builds: `dist/` is emptied before each build, so a renamed entry or dropped chunk cannot leave stale files that fail declaration checks or ship in a locally packed tarball.
