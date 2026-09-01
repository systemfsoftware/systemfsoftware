---
"@systemfsoftware/all": patch
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/omp-agent-discipline": none
"@systemfsoftware/omp-claude-compat": none
"@systemfsoftware/stryker-js": none
"@systemfsoftware/stryker-js-cli": none
"@systemfsoftware/stryker-js-html-reporter": none
"@systemfsoftware/stryker-js-instrumenter": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/stryker-plugins": none
"@systemfsoftware/stryker-test-contribution": none
---

Narrow @std ban to modules that overlap with Effect (fs → FileSystem, path → Path, encoding → Encoding, streams → Stream); other @std packages (crypto, dotenv, assert, testing, etc.) are now allowed
