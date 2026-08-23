---
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-mutation-run": patch
"@systemfsoftware/stryker-js-plugin-api": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
---

These packages no longer install dependencies they never imported, so installing them pulls less into your tree.

`tslib` is gone from all six. The mutation runner additionally stops installing `lodash.groupby`, `semver` and `source-map`, and the command line interface stops installing `@effect/platform-node-shared`. Nothing exported changes.
