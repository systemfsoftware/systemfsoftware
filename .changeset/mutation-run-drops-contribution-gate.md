---
"@systemfsoftware/stryker-js-mutation-run": major
---

The engine no longer judges test contribution, and the verdict envelope no longer includes a `testContribution` field. Install the companion plugin and list it in `plugins` if you want that check. Configs that extend this package's base preset now run the gate for workflow, policy, and kernel property tests; remove the plugin from `plugins` to turn it off.
