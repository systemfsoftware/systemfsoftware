---
"@systemfsoftware/stryker-js-typescript-checker": major
---

The checker is contributed as plain data: the plugin exports a factory instead of an Effect `Layer`, and `effect` is no longer required — it is not a dependency of this package at all. `typescript` remains the only peer dependency, resolved from your project.

Your configuration does not change: it is still selected as `"checkers": ["typescript"]`.
