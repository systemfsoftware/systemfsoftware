---
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-daemon-cluster": patch
"@systemfsoftware/effect-daemon-conformance": patch
"@systemfsoftware/effect-daemon-microvm": patch
"@systemfsoftware/effect-daemon-process": patch
"@systemfsoftware/effect-daemon-socket": patch
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/discern": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-memfs": patch
"@systemfsoftware/effect-microsandbox": patch
"@systemfsoftware/effect-readiness": patch
"@systemfsoftware/effect-spec-runtime": patch
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/npm-package": patch
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
"@systemfsoftware/rx-effect": patch
"@systemfsoftware/effect-schema-discovery": patch
"@systemfsoftware/effect-schema-extensions": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/hex-schema": patch
"@systemfsoftware/conformance-spec": patch
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/effect-sim-kernel": patch
"@systemfsoftware/tsdown-config": patch
"@systemfsoftware/vitest-config": patch
"@systemfsoftware/trace-spec": patch
"@systemfsoftware/trace-taxonomy": patch
---

The Effect dependency now resolves to 4.0.5, and so does every `@effect/*` package installed with it.

- Effect 4.0.5 requires `effect@^4.0.5` as a peer, so a tree mixing 4.0.5 with an earlier 4.0.x fails at import, not at install. Install the versions your tree's `@effect/*` packages name.
- `FileSystem.File.Info` reports `dev`, `ino`, `rdev`, `nlink` and `blocks` as `bigint` where it reported `number`. Convert at your own boundary with `BigInt` or `Number`.
- A decision's `instructions` and its classify and probability `criteria` accept a JSON object or array as well as a string, and a rating's `criteria` are `{ label, description }` entries rather than bare labels. Read a level's `label`, not the entry.
