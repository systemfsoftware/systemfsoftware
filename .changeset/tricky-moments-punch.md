---
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-html-reporter": patch
"@systemfsoftware/stryker-js-platform-node": patch
"@systemfsoftware/stryker-js": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
---

Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.
