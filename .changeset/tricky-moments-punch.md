---
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-mutation-report": patch
"@systemfsoftware/stryker-js-mutation-run": patch
"@systemfsoftware/stryker-js-plugin-api": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
---

Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.
