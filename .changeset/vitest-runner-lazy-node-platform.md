---
"@systemfsoftware/vitest": patch
---

The property runner loads the Node file system and path layers when a property first runs, so importing the runner in a browser test no longer evaluates Node-only modules (effect 4.1.0's Node file system reads `process` on import).
