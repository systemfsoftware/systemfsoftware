---
"@systemfsoftware/stryker-js-vitest-runner": major
---

The runner plugin no longer accepts options through its layer
factory; the layer reads the run configuration and sandbox directory from
its environment. Update the plugin declaration to construct the layer
without arguments.

The runner service no longer declares `init` or `dispose`. Startup happens
when the plugin layer is built and cleanup happens when it is torn down.

The dry-run and mutant-run phases now execute as cells that share one
typed decision over a strict union of task shapes; unexpected task shapes
are rejected at the boundary instead of widened.
