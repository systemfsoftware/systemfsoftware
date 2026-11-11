---
"@systemfsoftware/vitest": patch
---

@systemfsoftware/vitest/property-defaults no longer throws "process is not defined" when the shared config loads it in a browser project; there it uses the local run count.
