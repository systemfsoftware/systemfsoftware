---
"@systemfsoftware/effect-spec-runtime": minor
---

A suite's shared layer (`Suite.openShared`, `Suite.openSharedCase`, and so `.withLayer` on a feature) is now built once, by the suite's first case, shared by every case in the suite, and released when the suite ends. It used to be rebuilt fresh around every case, so an expensive fixture such as a server or a database was started and stopped once per scenario. A test that needs state no other case sees moves that state into the case layer (`Suite.openCase`, `.withScenarioLayer`).
