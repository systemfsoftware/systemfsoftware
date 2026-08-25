---
"@systemfsoftware/stryker-js-mutation-report": major
"@systemfsoftware/stryker-js-vitest-runner": major
---

effect is now a required peer dependency. Install it alongside these packages. They previously bundled their own copy, which meant two Effect instances in one process and services that could not find each other across the boundary.
