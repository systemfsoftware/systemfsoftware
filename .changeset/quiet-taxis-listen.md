---
"@systemfsoftware/all": none
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/stryker-js-cli": none
"@systemfsoftware/stryker-js-engine": none
"@systemfsoftware/stryker-js": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/omp-agent-discipline": none
"@systemfsoftware/stryker-js-html-reporter": none
"@systemfsoftware/stryker-js-instrumenter": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/stryker-plugins": none
"@systemfsoftware/stryker-test-contribution": none
---

Every package named here keeps its public surface and behaviour, so none of them releases; the intents record why their build inputs moved.

- The supervision-tree, mutation-CLI and mutation-engine packages author their descriptions through the new spec sugar; every exported signature and behaviour is unchanged, so their own consumers need do nothing.
- The mutation engine's sandbox additionally lost an internal second pass and a captured-state bridge; the exported sandbox contract is unchanged.
- The remainder are rebuild ripples of the types change and release nothing.
