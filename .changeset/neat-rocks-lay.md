---
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/effect-schema-extensions": patch
"@systemfsoftware/hex-schema": patch
"@systemfsoftware/stryker-js-engine": patch
"@systemfsoftware/stryker-js-html-reporter": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
"@systemfsoftware/stryker-plugins": patch
"@systemfsoftware/stryker-test-contribution": patch
---

Re-released against @systemfsoftware/stryker-js without the removed --llms manifest. The Run stream no longer carries a manifest terminal event, and the RunEvent / RunTerminalEvent unions no longer include the manifest arm, so any exhaustive consumer of those types must drop that case.
