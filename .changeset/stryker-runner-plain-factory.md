---
"@systemfsoftware/stryker-js-vitest-runner": major
---

The runner is contributed as plain data: the plugin exports a factory instead of an Effect `Layer`, and `effect` is no longer a peer dependency — install it only if something else in your project needs it. `vitest` remains the only peer dependency, resolved from your project.

Your configuration does not change: it is still selected as `"testRunner": "vitest"`.
