---
"@systemfsoftware/stryker-js-engine": major
"@systemfsoftware/stryker-js-cli": major
---

The Node host package `@systemfsoftware/stryker-js-platform-node` is gone: the engine (`@systemfsoftware/stryker-js-engine`) is the host-neutral mutation run, and the `stryker` CLI owns the Node composition roots and worker entries. Depend on the engine for the run and the CLI for process entries; install the new names.
