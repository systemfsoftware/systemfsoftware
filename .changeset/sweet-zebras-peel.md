---
"@systemfsoftware/effect-e2e": minor
---

New `@systemfsoftware/effect-e2e/engine` entry: the engine contract an engine adapter implements. `Engine` is the service tag; its shape opens a page, observes the semantic tree, queries, acts, reads, takes screenshots, reports the route, logs and capabilities, and closes. Each operation fails only with the engine failures `LOCATOR_NOT_FOUND`, `LOCATOR_AMBIGUOUS`, `ACTION_FAILED`, `AUTOMATION_UNSUPPORTED`, `APP_UNREACHABLE`, `APP_NOT_OPEN` and `ARTIFACT_WRITE_FAILED`, exported from the same entry with the observation, action, locator, capability, read, log and screenshot schemas. `Engine.layerTest(site)` provides an in-memory engine over a `MemorySite` for tests. The entry imports no browser driver and no Node module.
