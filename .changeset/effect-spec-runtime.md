---
'@systemfsoftware/effect-spec-runtime': minor
---

New package: the registration core behind Effect spec suites.

`Suite.open`, `Suite.openShared`, `Suite.openCase`, and `Suite.openSharedCase` register a suite with no layer, a shared suite layer, a per-case layer, or both. A shared layer is acquired once for the whole suite; a per-case layer is acquired and finalized around every case. Each entry takes a register mode (`run`, `skip`, `only`) and a live-clock flag that selects between the test-clock and live-clock case runners.

The error type and the case-body type are parameters of the suite, so a consumer declares its own error union and case shape. `TaskRef.RawVitestTaskRef` hands the running test's context to the case body in whatever form the test runner passes it, including a callable context; `TaskRef.VitestTaskRef` carries it only when it is a plain object. `SuiteScope` resolves a scope map into the services it names.
