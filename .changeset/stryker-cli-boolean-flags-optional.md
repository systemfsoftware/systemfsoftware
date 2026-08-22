---
"@systemfsoftware/stryker-js-cli": patch
---

Fix the CLI refusing to start with a missing-flag error when optional boolean flags were omitted. Starting a mutation run, printing help, or emitting the agent manifest now works without explicitly passing `incremental`, `force`, `ignoreStatic`, or the other boolean flags.
