---
"@systemfsoftware/oxlint-plugin-effect-schema": minor
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/all": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-gherkin-spec": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/effect-schema-discovery": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/effect-schema-law": none
"@systemfsoftware/effect-schema-recursion-budget": none
"@systemfsoftware/effect-schema-vite": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/npm-package": none
"@systemfsoftware/omp-typescript-discipline": none
"@systemfsoftware/oxlint-plugin-effect-dmmf": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
---

The `schema-filter-constructive-generation` rule distinguishes scalar and struct receiver chains: `arbitrary: { candidate }` no longer satisfies the rule on any receiver, struct filters are permitted without annotations because Effect v4 provides no compiler hook for constructive cross-field filter generation, and node `toCodecArbitrary` overrides only silence the rule on `Schema.declare` receivers where the compiler honors them.
