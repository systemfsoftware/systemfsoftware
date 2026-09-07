---
"@systemfsoftware/stryker-js-engine": major
---

Incremental-run admission now accepts only the eight defined mutant statuses; a previous report carrying any other status discards that file's remembered state instead of re-running it blindly, and statuses that were previously forced to re-run (compile errors, runtime errors, pending) are now remembered. Plugin contributions, mutation-report payloads, and checker answers are validated structurally at decode — malformed shapes that previously passed as valid now fail with the real reason. Internal-only helpers are no longer exported from the package root; import `defaultOptions` and `readConfig` as before, anything else was never public contract.
