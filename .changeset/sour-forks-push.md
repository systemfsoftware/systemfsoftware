---
"@systemfsoftware/vitest": patch
"@systemfsoftware/conformance-spec": none
"@systemfsoftware/differential-spec": none
"@systemfsoftware/discern": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-daemon-cluster": none
"@systemfsoftware/effect-daemon-conformance": none
"@systemfsoftware/effect-daemon-microvm": none
"@systemfsoftware/effect-daemon-process": none
"@systemfsoftware/effect-daemon-socket": none
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
"@systemfsoftware/npm-package": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
"@systemfsoftware/trace-spec": none
"@systemfsoftware/trace-taxonomy": none
---

A check whose matcher returns a promise — `toMatchScreenshot`, or an async matcher registered with `expect.extend` — now holds its step until the promise settles. A rejection fails the test that yielded the check, carrying the line that wrote it, instead of passing that test and surfacing later as an unhandled error. A written check that is never yielded is still refused.
